/**
 * Formatea una fecha proveniente de MySQL ('YYYY-MM-DD HH:MM:SS' o 'YYYY-MM-DD',
 * ya que el pool usa dateStrings: true) a un formato legible en español
 * (dd/mm/aaaa [hh:mm]). Devuelve '—' si no hay valor, o el texto original
 * si no logra interpretarlo como fecha.
 */
export function formatearFecha(valor) {
  if (!valor) return '—';
  const fecha = new Date(String(valor).replace(' ', 'T'));
  if (Number.isNaN(fecha.getTime())) return String(valor);
  const soloFecha = !/\d{2}:\d{2}/.test(String(valor));
  return fecha.toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(soloFecha ? {} : { hour: '2-digit', minute: '2-digit' })
  });
}
