import axios from 'axios';
const api = axios.create({ baseURL: 'http://localhost:4000/api' });
export const fetchTestcases = () => api.get('/testcases').then(r => r.data);
export const createTestcases = (payload) => api.post('/testcases', payload).then(r => r.data);
export const updateTestcase = (filename, payload) => api.put(`/testcases/${filename}`, payload).then(r => r.data);
export const deleteTestcase = (filename) => api.delete(`/testcases/${filename}`).then(r => r.data);
