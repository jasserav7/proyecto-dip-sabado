import axios from 'axios';

export const api = axios.create({
  baseURL: 'http://localhost:4000/api'
});

// Adjunta el id del usuario autenticado (sesion guardada en localStorage)
// como encabezado x-user-id en cada peticion, tal como lo espera el backend.
api.interceptors.request.use((config) => {
  const sesion = localStorage.getItem('sesion');
  if (sesion) {
    const { id } = JSON.parse(sesion);
    config.headers['x-user-id'] = id;
  }
  return config;
});

export const AuthAPI = {
  login: async (usuario, contrasena) => {
    const r = await api.post('/auth/login', { usuario, contrasena });
    return r.data;
  },
  me: async () => {
    const r = await api.get('/auth/me');
    return r.data;
  }
};

export const CatalogosAPI = {
  roles: async () => {
    const r = await api.get('/catalogos/roles');
    return r.data;
  },
  estados: async () => {
    const r = await api.get('/catalogos/estados');
    return r.data;
  },
  cursos: async () => {
    const r = await api.get('/catalogos/cursos');
    return r.data;
  },
  vigencias: async () => {
    const r = await api.get('/catalogos/vigencias');
    return r.data;
  },
  estudiantesPorCurso: async (idCurso, idVigencia) => {
    const r = await api.get('/catalogos/estudiantes-por-curso', {
      params: { id_curso: idCurso, id_vigencia: idVigencia }
    });
    return r.data;
  },
  misAcudidos: async () => {
    const r = await api.get('/catalogos/mis-acudidos');
    return r.data;
  }
};

export const CasosAPI = {
  list: async (params) => {
    const r = await api.get('/casos', { params });
    return r.data;
  },
  get: async (id) => {
    const r = await api.get(`/casos/${id}`);
    return r.data;
  },
  porEstudiante: async (idEstudiante) => {
    const r = await api.get(`/casos/estudiante/${idEstudiante}`);
    return r.data;
  },
  create: async (data) => {
    const r = await api.post('/casos', data);
    return r.data;
  },
  cargaMasiva: async (formData) => {
    const r = await api.post('/casos/carga-masiva', formData);
    return r.data;
  },
  cambiarEstado: async (id, estado) => {
    const r = await api.put(`/casos/${id}`, { estado });
    return r.data;
  },
  agregarActuacion: async (id, data) => {
    const r = await api.post(`/casos/${id}/actuaciones`, data);
    return r.data;
  },
  eliminarActuacion: async (id, idActuacion) => {
    const r = await api.delete(`/casos/${id}/actuaciones/${idActuacion}`);
    return r.data;
  },
  eliminar: async (id) => {
    const r = await api.delete(`/casos/${id}`);
    return r.data;
  },
  cargarEvidencia: async (id, formData) => {
    const r = await api.post(`/casos/${id}/evidencias`, formData);
    return r.data;
  },
  descargarEvidencia: (idCaso, idEvidencia) =>
    api.get(`/casos/${idCaso}/evidencias/${idEvidencia}/descarga`, { responseType: 'blob' }),
  exportarCsv: (idCaso) =>
    api.get(`/casos/${idCaso}/exportar`, { responseType: 'blob' }),
  exportarPdf: (idCaso) =>
    api.get(`/casos/${idCaso}/exportar-pdf`, { responseType: 'blob' }),
  generarRemision: async (id) => {
    const r = await api.post(`/casos/${id}/remision`, { confirmar: true });
    return r.data;
  },
  listarRemisiones: async (id) => {
    const r = await api.get(`/casos/${id}/remisiones`);
    return r.data;
  },
  descargarRemision: (idCaso, idRemision) =>
    api.get(`/casos/${idCaso}/remisiones/${idRemision}/descarga`, { responseType: 'blob' })
};

/**
 * Dispara la descarga de un blob en el navegador con el nombre indicado.
 */
export function descargarBlob(blob, nombreArchivo) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export const AuditoriaAPI = {
  list: async (idCaso) => {
    const r = await api.get('/auditoria', { params: idCaso ? { id_caso: idCaso } : {} });
    return r.data;
  }
};
