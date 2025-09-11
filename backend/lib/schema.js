const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true });

const schema = {
  type: 'object',
  properties: {
    description: { type: 'string' },
    testOrder: { type: 'number' },
    enabled: { type: 'boolean' },
    testSteps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stepName: { type: 'string' },
          action: { type: 'string' },
      path: { type: 'string' },
      selector: { type: 'string' },
      selectorType: { type: 'string', enum: ['css', 'xpath', 'id', 'text', 'testId'] },
      data: {},
          waitTime: { type: 'number' },
            iterate: { type: 'boolean' },
            customName: { type: 'string' },
          soft: { type: 'boolean' },
          validations: {
            type: 'array',
            items: {
              type: 'object',
      properties: {
        type: { type: 'string' },
        selector: { type: 'string' },
        selectorType: { type: 'string', enum: ['css', 'xpath', 'id', 'text', 'testId'] },
        path: { type: 'string' },
                data: {},
                message: { type: 'string' },
        soft: { type: 'boolean' },
        attribute: { type: 'string' },
        cssProperty: { type: 'string' }
      },
      required: ['type']
            }
          }
    },
    required: ['action']
      }
    }
  },
  required: ['description', 'testSteps']
};

const validate = ajv.compile(schema);
module.exports.validateTestCase = (obj) => {
  const valid = validate(obj);
  return { valid, errors: validate.errors };
};

module.exports.normalizeFilename = (base) => base.toLowerCase().replace(/[^a-z0-9\-_]/g, '_');
