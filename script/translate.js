require('dotenv').config();
const fs = require('fs');
const path = require('path');
const lodash = require('lodash');
const pLimit = require('p-limit');

const scriptDir = __dirname;

if (!process.env.OPENAI_API_KEY) {
    console.error('请设置环境变量 OPENAI_API_KEY');
    process.exit(1);
}
if (!process.env.OPENAI_API_BASE) {
    console.error('请设置环境变量 OPENAI_API_BASE');
    process.exit(1);
}

const targetLanguages = [{
    name: 'zh-CN',
    label: '简体中文',
}];

async function retry(fn, maxRetry = 5, interval = 1000) {
    for (let retryCount = 0; ; retryCount++) {
        try {
            return await fn();
        } catch (error) {
            if (retryCount >= maxRetry) throw error;
            const delay = Math.min(interval * 2 ** retryCount, 30000);
            console.log(`翻译请求失败，${delay}ms 后重试:`, error.message);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

function cleanContent(content) {
    return content
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .trim()
        .replace(/^```(?:json)?\s*|\s*```$/g, '');
}

async function requestTranslation(message, language, batch = false) {
    return retry(async () => {
        const response = await fetch(`${process.env.OPENAI_API_BASE}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: `你是 n8n 项目的翻译助手，请将英文文本翻译成${language}。
限制：
- 保留 {} 中的变量名，不要翻译变量名
- 保留 HTML、Markdown、换行和代码内容
- 不要添加解释
${batch
    ? '- 输入是 JSON 数组，必须只返回 JSON 对象，格式为 {"0":"翻译结果","1":"翻译结果"}，数字 key 必须与输入 id 完全对应'
    : '- 只输出翻译结果，不要包裹 Markdown 代码块'}`,
                    },
                    {
                        role: 'user',
                        content: message,
                    },
                ],
            }),
        });

        if (response.status < 200 || response.status >= 300) {
            const body = await response.text();
            throw new Error(response.status === 429
                ? `请求过多: ${body}`
                : `翻译请求失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(`翻译失败: ${data.error.message}`);
        }

        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string') {
            throw new Error('翻译接口返回内容为空');
        }

        return cleanContent(content);
    });
}

async function doTranslate(message, language) {
    return requestTranslation(message, language);
}

async function doBatchTranslate(items, language) {
    const input = items.map((item, index) => ({
        id: String(index),
        text: item.message,
    }));
    const content = await requestTranslation(JSON.stringify(input), language, true);
    let translations;
    try {
        translations = JSON.parse(content);
    } catch (error) {
        throw new Error(`批量翻译返回的不是有效 JSON: ${error.message}`);
    }

    if (!translations || Array.isArray(translations) || typeof translations !== 'object') {
        throw new Error('批量翻译返回格式错误');
    }

    return items.map((item, index) => {
        const translation = translations[String(index)];
        if (typeof translation !== 'string' || !translation.trim()) {
            throw new Error(`批量翻译缺少第 ${index + 1} 条结果`);
        }
        return { item, translation: translation.trim() };
    });
}

function putObjectValue(obj, key, value) {
    const keys = key.split('##');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!current[k]) current[k] = {};
        current = current[k];
    }

    current[keys[keys.length - 1]] = value;
}

async function translate(waitTranslateList, targetObject, targetLanguage) {
    const batchSize = Math.max(parseInt(process.env.OPENAI_API_BATCH_SIZE || 20, 10), 1);
    const concurrentNum = Math.max(parseInt(process.env.OPENAI_API_CONCURRENT || 5, 10), 1);
    const batches = [];

    for (let i = 0; i < waitTranslateList.length; i += batchSize) {
        batches.push(waitTranslateList.slice(i, i + batchSize));
    }

    console.log(
        '翻译条目', waitTranslateList.length,
        '批次', batches.length,
        '每批', batchSize,
        '并发批次', concurrentNum,
    );

    let completed = 0;
    const limit = pLimit(concurrentNum);
    await Promise.all(batches.map(batch => limit(async () => {
        try {
            const results = await doBatchTranslate(batch, targetLanguage);
            for (const { item, translation } of results) {
                console.log('翻译 key', item.key, '为', targetLanguage, ':', item.message, ' => ', translation);
                putObjectValue(targetObject, item.key, translation);
            }
        } catch (error) {
            console.error(`批量翻译 ${batch.length} 条失败，改为逐条重试:`, error.message);
            for (const item of batch) {
                try {
                    const translation = await doTranslate(item.message, targetLanguage);
                    console.log('翻译 key', item.key, '为', targetLanguage, ':', item.message, ' => ', translation);
                    putObjectValue(targetObject, item.key, translation);
                } catch (itemError) {
                    console.error('翻译失败', item.key, ':', itemError.message);
                }
            }
        } finally {
            completed += batch.length;
            console.log('剩余翻译数量', waitTranslateList.length - completed);
        }
    })));
}

function collectMessages(oldSourceLanguages, newSourceLanguages, targetLanguages, parentKey = '', waitTranslateList = []) {
    const forceRetranslate = process.env.OPENAI_FORCE_RETRANSLATE === 'true';

    for (const key in newSourceLanguages) {
        const currentKey = parentKey ? `${parentKey}##${key}` : key;
        if (newSourceLanguages[key] instanceof Object) {
            collectMessages(
                oldSourceLanguages[key] || {},
                newSourceLanguages[key],
                targetLanguages[key] || {},
                currentKey,
                waitTranslateList,
            );
        } else if (forceRetranslate ||
            targetLanguages[key] === undefined
            || oldSourceLanguages[key] === undefined
            || oldSourceLanguages[key] !== newSourceLanguages[key]
        ) {
            waitTranslateList.push({
                key: currentKey,
                message: newSourceLanguages[key],
            });
        }
    }
}

async function run() {
    const oldEnLanguages = require(path.join(scriptDir, 'en.json'));
    const nodesFileName = path.join(scriptDir, 'en-nodes.json');
    const newEnNodesLanguages = fs.existsSync(nodesFileName) ? require(nodesFileName) : {};
    const sourceRef = process.env.N8N_I18N_SOURCE_REF || 'master';
    let newEnLanguages = await fetch(`https://raw.githubusercontent.com/n8n-io/n8n/${sourceRef}/packages/frontend/%40n8n/i18n/src/locales/en.json`)
        .then(response => response.json());

    for (const targetLanguage of targetLanguages) {
        let targetLanguages = {};
        const fileName = path.join(scriptDir, `../languages/${targetLanguage.name}.json`);
        if (fs.existsSync(fileName)) {
            targetLanguages = JSON.parse(fs.readFileSync(fileName, 'utf8'));
        } else {
            console.warn(`${targetLanguage.label}语言文件不存在，创建新文件:`, fileName);
        }

        const waitTranslateList = [];
        newEnLanguages = lodash.merge({}, newEnLanguages, newEnNodesLanguages);
        collectMessages(oldEnLanguages, newEnLanguages, targetLanguages, '', waitTranslateList);
        await translate(waitTranslateList, targetLanguages, targetLanguage.label);

        const sortedTargetLanguages = {};
        for (const key in newEnLanguages) {
            if (targetLanguages[key] !== undefined) sortedTargetLanguages[key] = targetLanguages[key];
        }
        fs.writeFileSync(fileName, JSON.stringify(sortedTargetLanguages, null, 4));
    }

    fs.writeFileSync(path.join(scriptDir, 'en.json'), JSON.stringify(newEnLanguages, null, 4));
}

run();
