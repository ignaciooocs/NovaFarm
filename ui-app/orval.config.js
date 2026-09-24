/** @type {import('orval').Config} */
module.exports = {
  novaFarmApi: {
    input: process.env.NOVAFARM_API_SPEC_URL ?? 'http://localhost:3000/api-docs-json',
    output: {
      mode: 'tags-split',
      target: './api/generated',
      // react-query y no axios: además de las funciones sueltas genera los
      // hooks (useQuery para GET, useMutation para el resto) y sus query
      // keys. No todo pasa por los hooks — lo que alimenta SQLite y el sync
      // siguen llamando a las funciones sueltas a propósito, ver "Capa de
      // API" en docs/diagrams/ui-arquitectura.md.
      client: 'react-query',
      // Sin esto orval 8 genera las llamadas con forma de fetch —
      // apiClient(url, RequestInit) esperando { data, status, headers } de
      // vuelta — y apiClient es un mutator de axios que recibe
      // AxiosRequestConfig y devuelve la data directo. Ahí vive el token de
      // Firebase, el X-Sync-Id, el timeout y el log; no se reemplaza.
      httpClient: 'axios',
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
