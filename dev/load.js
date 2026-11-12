/*
 * This control's pure modules, loaded in Node through the template's
 * `dev/modules.js` — the rule `pcf-data-table`'s `load.js` set: no React, no
 * Fluent, no component tree, no generated types.
 */

'use strict';

const path = require('path');
const { createLoader } = require('./modules.js');

module.exports = {
    load: createLoader({
        root: path.join(__dirname, '..', 'KanbanBoard'),
        forbid: [
            [/^react/, 'React'],
            [/^@fluentui/, 'Fluent'],
            [/components\//, 'the component tree'],
            [/generated\//, 'the generated manifest types'],
        ],
    }),
};
