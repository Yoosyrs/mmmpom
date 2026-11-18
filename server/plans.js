export const PLATFORM_NAME = 'SKILLVERSE';
export const COMMISSION_RATE = 20;

export const PLANS = [
  {
    id: 'free',
    name: 'Explorador',
    price_cents: 0,
    interval: null,
    tagline: 'Aprende y comparte sin costo',
    features: [
      'Acceso a cursos gratuitos del catálogo',
      'Laboratorio de proyectos con 3 archivos por proyecto',
      'Comunidad, grupos y desafíos',
      'Certificados de cursos completados',
      'Asistente de aprendizaje con límite diario',
    ],
    limits: { ai_messages_per_day: 15, project_files: 3 },
  },
  {
    id: 'premium',
    name: 'Premium',
    price_cents: 999,
    interval: 'mes',
    tagline: 'Para quien aprende en serio',
    features: [
      'Cursos seleccionados marcados como Premium',
      'Herramientas de estudio avanzadas y planes generados con IA',
      'Seguimiento ampliado de progreso y rachas',
      'Recursos exclusivos descargables',
      'Sin anuncios en la plataforma',
    ],
    limits: { ai_messages_per_day: 200, project_files: 10 },
  },
  {
    id: 'edu',
    name: 'Educativo',
    price_cents: null,
    interval: 'personalizado',
    tagline: 'Academias, instituciones y equipos',
    features: [
      'Panel de grupo y seguimiento de estudiantes',
      'Rutas de aprendizaje asignadas',
      'Reportes de avance exportables',
      'Facturación institucional',
      'Acompañamiento de implementación',
    ],
    limits: { ai_messages_per_day: 200, project_files: 10 },
    requiresQuote: true,
  },
];

export function planById(id) {
  return PLANS.find((plan) => plan.id === id) || PLANS[0];
}
