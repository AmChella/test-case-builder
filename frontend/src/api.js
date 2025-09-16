import axios from 'axios';
const api = axios.create({ baseURL: 'http://localhost:4002/api' });
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
  const res = await client.post('/run-test', { scenarios, env, headless, grep });
  return res.data; // { code, stdout, stderr }
};
