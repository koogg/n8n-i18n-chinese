const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '../node_modules/n8n-nodes-base/dist');

console.log('baseDir', baseDir);

const whiteNodes = [
    'calendlyTrigger',
    'code',
    'cron',
    'clearbit',
    'filter',
    'function',
    'githubTrigger',
    'git',
    'gmail',
    'googleSheets',
    'errorTrigger',
    'elasticSecurity',
    'emailSend',
    'emailReadImap',
    'executeCommand',
    'formTrigger',
    'html',
    'httpRequest',
    'httpRequestTool',
    'if',
    'interval',
    'itemLists',
    'jira',
    'jiraTrigger',
    'microsoftExcel',
    'manualTrigger',
    'n8n',
    'noOp',
    'stickyNote',
    'notionTrigger',
    'segment',
    'set',
    'scheduleTrigger',
    'slack',
    'spreadsheetFile',
    'splitInBatches',
    'start',
    'switch',
    'telegram',
    'wait',
    'webhook',
    'workflowTrigger',
    'executeWorkflow',
    'executeWorkflowTrigger',
    'discord',
    'extractFromFile',
    'convertToFile',
    'dateTime',
    'removeDuplicates',
    'splitOut',
    'limit',
    'summarize',
    'aggregate',
    'merge',
    'markdown',
    'xml',
    'crypto',
    'rssFeedRead',
    'compression',
    'editImage',
    'aiTransform',
    'form',
    'github',
    'slackTrigger',
    'telegramTrigger',
    'respondToWebhook',
];

// 递归扫描文件夹
function loadModules(dir, endFileName='.node.js') {
    const loadedModules = [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            loadedModules.push(...loadModules(fullPath)); // 递归
        } else if (entry.isFile() && entry.name.endsWith(endFileName)) {
            try {
                const mod = require(fullPath);
                loadedModules.push(mod);
            } catch (err) {
                console.error(`加载模块失败: ${fullPath}`, err);
            }
        }
    }

    return loadedModules;
}

function handleNode(nodeCls){
    const instance = new nodeCls()
    const description = instance.description

    // 判断 description.group 和 whiteNodeGroups 是否有重叠的
    if (!whiteNodes.includes(description.name)) {
        return null;
    }
    const languages = {
        nodeView: {

        }
    };
    const headers = {};
    let keys = ['description'];
    for (const key of keys) {
        if (description[key]) {
            headers[`${key}`] = description[key];
        }
    }
    const properties = description.properties || [];
    for (const propertie of properties) {
        let keys = ['displayName', 'description', 'placeholder', 'hint'];
        languages['nodeView'][propertie.name] = {}
        for (const key of keys) {
            if (propertie[key]) {
                languages['nodeView'][propertie.name][key] = propertie[key];
            }else if (key === 'displayName'){
                languages['nodeView'][propertie.name][key] = propertie.name;
            }
        }
        if (propertie['options']){
            languages['nodeView'][propertie.name]['options'] = {};
            let keys = ['displayName', 'description'];
            for (const option of propertie['options']) {
                languages['nodeView'][propertie.name]['options'][option.name] = {}
                for (const key of keys) {
                    if (option[key]) {
                        languages['nodeView'][propertie.name]['options'][option.name][key] = option[key];
                    }else if (key === 'displayName'){
                        languages['nodeView'][propertie.name]['options'][option.name][key] = option.name;
                    }
                }
                if (Object.keys(languages['nodeView'][propertie.name]['options'][option.name]).length === 0){
                    delete languages['nodeView'][propertie.name]['options'][option.name];
                }
            }
            if (Object.keys(languages['nodeView'][propertie.name]['options']).length === 0){
                delete languages['nodeView'][propertie.name]['options'];
            }
        }
    }
    return {
        bases: {
            [description.name]: languages
        },
        headers: {
            [description.name]: headers
        }
    };
}

const nodeModules = loadModules(baseDir + '/nodes');

console.log('获取到', nodeModules.length, '个节点模块');

let allNodeBases = {};
let allNodeHeaders = {}

for (const nodeModule of nodeModules) {
    let name = Object.keys(nodeModule).find(name => /^class\s/.test(Function.prototype.toString.call(nodeModule[name])))
    let nodeCls = nodeModule[name];

    const data = handleNode(nodeCls)
    if (!data) continue;
    try {
        allNodeBases = {...allNodeBases, ...data.bases};
        allNodeHeaders = {...allNodeHeaders, ...data.headers};
    }catch (e){
        console.error(`处理节点 ${name} 失败:`, nodeModule, e);
    }
}

console.log('处理完成，共有', Object.keys(allNodeBases).length, '个节点');


fs.writeFileSync("en-nodes.json", JSON.stringify({
    "n8n-nodes-base": {
        "nodes": allNodeBases
    },
    "headers": allNodeHeaders
}, null, 2), 'utf8');
