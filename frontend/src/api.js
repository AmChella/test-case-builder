import axios from 'axios';
const api = axios.create({ baseURL: 'http://localhost:4002/api' });

// Inject x-debug header when frontend debug mode enabled (localStorage key 'tcb-debug' set by LoggerProvider)
api.interceptors.request.use(cfg => {
  try {
    if (localStorage.getItem('tcb-debug') === '1') {
      cfg.headers['x-debug'] = '1';
    }
  } catch {}
  return cfg;
});
api.interceptors.response.use(r => r, err => {
  try {
    const logger = window.__tcbLogger;
    if (logger && err?.response?.data) {
      const data = err.response.data;
      if (data.error) {
        logger.error(`API ${err.config?.method?.toUpperCase()} ${err.config?.url} — ${data.error}`, { status: err.response.status, details: data.details, debug: data.debug });
      }
    }
  } catch {}
  return Promise.reject(err);
});

export const fetchTestcases = (product) => api.get('/testcases', { params: product ? { product } : {} }).then(r => r.data);
export const createTestcases = (payload) => api.post('/testcases', payload).then(r => r.data);
export const updateTestcase = (filename, payload) => api.put(`/testcases/${filename}`, payload).then(r => r.data);
export const deleteTestcase = (filename) => api.delete(`/testcases/${filename}`).then(r => r.data);

// Products
export const fetchProducts = () => api.get('/products').then(r => r.data);
export const createProduct = (payload) => api.post('/products', payload).then(r => r.data);
export const deleteProduct = (name) => api.delete(`/products/${encodeURIComponent(name)}`).then(r => r.data);

// Run tests through the external runner service on port 4001.
// payload: { scenarios: object|array, env?: string, headless?: boolean, grep?: string }
export const runTest = async ({ scenarios, env, headless, grep }) => {
  const client = axios.create({ baseURL: 'http://localhost:4001' });
  // Also propagate debug header to runner if present
  try { if (localStorage.getItem('tcb-debug') === '1') client.interceptors.request.use(c => { c.headers['x-debug'] = '1'; return c; }); } catch {}
  const res = await client.post('/run-test', { scenarios, env, headless, grep });
  return res.data; // { code, stdout, stderr }
};
