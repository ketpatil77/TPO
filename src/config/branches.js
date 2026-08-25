const BRANCHES = Object.freeze([
    { code: 'AIML', name: 'Artificial Intelligence & Machine Learning' },
    { code: 'CT', name: 'Computer Technology' },
    { code: 'EE', name: 'Electrical Engineering' },
    { code: 'ME', name: 'Mechanical Engineering' },
    { code: 'CE', name: 'Civil Engineering' },
    { code: 'E&C', name: 'Electronics & Communication Engineering' }
]);

const aliases = new Map([
    ['aiml', 'AIML'], ['ai&ml', 'AIML'], ['ai ml', 'AIML'], ['artificial intelligence & machine learning', 'AIML'],
    ['ct', 'CT'], ['computer technology', 'CT'], ['computer engineering', 'CT'], ['information technology', 'CT'],
    ['ee', 'EE'], ['electrical engineering', 'EE'], ['electronics & telecom', 'EE'],
    ['me', 'ME'], ['mechanical engineering', 'ME'],
    ['ce', 'CE'], ['civil engineering', 'CE'],
    ['e&c', 'E&C'], ['e and c', 'E&C'], ['ec', 'E&C'], ['e&tc', 'E&C'], ['entc', 'E&C'],
    ['electronics & communication', 'E&C'], ['electronics and communication', 'E&C'],
    ['electronics & communication engineering', 'E&C'], ['electronics and communication engineering', 'E&C']
]);

function normalizeBranch(value) {
    const text = String(value || '').trim();
    return aliases.get(text.toLowerCase()) || BRANCHES.find(branch => branch.code === text.toUpperCase())?.code || null;
}

function branchName(code) {
    return BRANCHES.find(branch => branch.code === code)?.name || code;
}

module.exports = { BRANCHES, normalizeBranch, branchName };
