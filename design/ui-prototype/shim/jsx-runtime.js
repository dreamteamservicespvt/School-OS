const R = window.React;
function jsx(type, props, key) { const p = Object.assign({}, props); if (key !== undefined) p.key = key; return R.createElement(type, p); }
module.exports = { jsx, jsxs: jsx, Fragment: R.Fragment };
