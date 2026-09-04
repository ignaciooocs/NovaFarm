/** @type {import('orval').Config} */
module.exports = {
  novaFarmApi: {
    input: process.env.NOVAFARM_API_SPEC_URL ?? 'http://localhost:3000/api-docs-json',
    output: {
      mode: 'tags-split',
      target: './api/generated',
      client: 'axios',
      clean: true,
      override: {
        mutator: {
          path: './api/axios-instance.ts',
          name: 'apiClient',
        },
      },
    },
  },
};
