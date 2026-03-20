import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach Authorization header
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 by logging out and redirecting
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// ─── Admin API helpers ──────────────────────────────────────────────────────

export const adminApi = {
  // Auth
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  // Dashboard
  getDashboardStats: () => api.get('/admin/stats'),
  getSystemHealth: () => api.get('/admin/health'),
  getDauTimeSeries: (days: number) => api.get(`/admin/analytics/dau?days=${days}`),
  getMessagesTimeSeries: (days: number) => api.get(`/admin/analytics/messages?days=${days}`),
  getRecentTenants: () => api.get('/admin/tenants?limit=5&sort=createdAt:desc'),

  // Tenants
  getTenants: (params?: Record<string, string>) =>
    api.get('/admin/tenants', { params }),
  getTenant: (id: string) => api.get(`/admin/tenants/${id}`),
  createTenant: (data: {
    name: string;
    adminEmail: string;
    plan: string;
  }) => api.post('/admin/tenants', data),
  updateTenant: (id: string, data: Partial<{ plan: string; status: string }>) =>
    api.patch(`/admin/tenants/${id}`, data),
  deleteTenant: (id: string) => api.delete(`/admin/tenants/${id}`),
  suspendTenant: (id: string) => api.post(`/admin/tenants/${id}/suspend`),
  activateTenant: (id: string) => api.post(`/admin/tenants/${id}/activate`),
  getTenantUsers: (id: string, params?: Record<string, string>) =>
    api.get(`/admin/tenants/${id}/users`, { params }),
  getTenantAuditLogs: (id: string) =>
    api.get(`/admin/tenants/${id}/audit-logs`),

  // Users
  getUsers: (params?: Record<string, string>) =>
    api.get('/admin/users', { params }),
  getUser: (id: string) => api.get(`/admin/users/${id}`),
  resetUserPassword: (id: string) => api.post(`/admin/users/${id}/reset-password`),
  suspendUser: (id: string) => api.post(`/admin/users/${id}/suspend`),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),

  // Analytics
  getAnalytics: (params: { range: number }) =>
    api.get('/admin/analytics', { params }),
  getDauMau: (days: number) => api.get(`/admin/analytics/dau-mau?days=${days}`),
  getTopChannels: (days: number) => api.get(`/admin/analytics/top-channels?days=${days}`),
  getUserGrowth: (days: number) => api.get(`/admin/analytics/user-growth?days=${days}`),
  getFeatureUsage: () => api.get('/admin/analytics/feature-usage'),

  // Audit logs
  getAuditLogs: (params?: Record<string, string>) =>
    api.get('/admin/audit-logs', { params }),

  // Billing
  getBillingOverview: () => api.get('/admin/billing/overview'),
  getTenantBilling: (id: string) => api.get(`/admin/billing/tenants/${id}`),
  updateTenantPlan: (id: string, plan: string) =>
    api.post(`/admin/billing/tenants/${id}/plan`, { plan }),
};
