import { get, insert, run, nowIso } from './db.js';
import { hashPassword } from './auth.js';

export const CATEGORIES = [
  {
    slug: 'tecnologia',
    name: 'Tecnología',
    description: 'Programación, web, IA, seguridad defensiva y datos.',
    icon: 'code',
    gradient: 'aurora',
    subs: [
      ['programacion', 'Programación', 'Lógica, algoritmos y primeros lenguajes.'],
      ['desarrollo-web', 'Desarrollo web', 'HTML, CSS, JavaScript y aplicaciones web.'],
      ['inteligencia-artificial', 'Inteligencia artificial', 'Modelos, prompts y automatización con criterio.'],
      ['ciberseguridad', 'Ciberseguridad defensiva', 'Higiene digital, contraseñas y protección de datos.'],
      ['bases-de-datos', 'Bases de datos', 'Modelado, SQL y persistencia de información.'],
    ],
  },
  {
    slug: 'diseno',
    name: 'Diseño',
    description: 'Comunicación visual, experiencia de usuario e ilustración.',
    icon: 'palette',
    gradient: 'violet',
    subs: [
      ['diseno-grafico', 'Diseño gráfico', 'Composición, tipografía y color.'],
      ['ux-ui', 'Diseño UX/UI', 'Investigación, flujos e interfaces usables.'],
      ['ilustracion-digital', 'Ilustración digital', 'Dibujo vectorial y narrativa visual.'],
      ['edicion-fotografica', 'Edición fotográfica', 'Revelado digital y corrección de color.'],
      ['animacion', 'Animación', 'Movimiento, ritmo y microinteracciones.'],
    ],
  },
  {
    slug: 'negocios',
    name: 'Negocios',
    description: 'Emprender, vender y administrar con criterio.',
    icon: 'briefcase',
    gradient: 'teal',
    subs: [
      ['emprendimiento', 'Emprendimiento', 'De la idea al primer cliente.'],
      ['marketing-digital', 'Marketing digital', 'Contenido, embudos y medición honesta.'],
      ['comercio-electronico', 'Comercio electrónico', 'Tiendas digitales, catálogo y logística.'],
      ['administracion', 'Administración', 'Procesos, equipos y operación.'],
      ['finanzas-personales', 'Finanzas personales', 'Presupuesto, ahorro y decisiones.'],
    ],
  },
  {
    slug: 'contenido',
    name: 'Creación de contenido',
    description: 'Video, foto, escritura, música y redes sociales.',
    icon: 'camera',
    gradient: 'sunset',
    subs: [
      ['edicion-video', 'Edición de video', 'Montaje, ritmo y narrativa audiovisual.'],
      ['fotografia', 'Fotografía', 'Luz, encuadre y composición.'],
      ['escritura', 'Escritura', 'Claridad, estructura y estilo.'],
      ['produccion-musical', 'Producción musical', 'Beats, mezcla y publicación.'],
      ['redes-sociales', 'Redes sociales', 'Comunidad, formatos y calendario.'],
    ],
  },
  {
    slug: 'practicas',
    name: 'Habilidades prácticas',
    description: 'Herramientas para aprender y trabajar mejor.',
    icon: 'compass',
    gradient: 'ocean',
    subs: [
      ['comunicacion', 'Comunicación', 'Escuchar, explicar y conversar mejor.'],
      ['idiomas', 'Idiomas', 'Práctica constante y comprensión real.'],
      ['investigacion', 'Investigación', 'Buscar, contrastar y citar fuentes.'],
      ['pensamiento-critico', 'Pensamiento crítico', 'Evaluar argumentos y detectar sesgos.'],
      ['organizacion', 'Organización', 'Sistemas simples para no olvidar nada.'],
    ],
  },
];

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo2026aprende';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Skillverse2026';

export function seedDatabase() {
  const existing = get('SELECT COUNT(*) AS total FROM users');
  if (existing && Number(existing.total) > 0) return { seeded: false };

  const createdAt = nowIso();

  for (const [index, category] of CATEGORIES.entries()) {
    run('INSERT INTO categories (slug, name, description, icon, gradient, position) VALUES (?,?,?,?,?,?)', [
      category.slug,
      category.name,
      category.description,
      category.icon,
      category.gradient,
      index,
    ]);
    category.subs.forEach(([slug, name, description], position) => {
      run('INSERT INTO subcategories (slug, category_slug, name, description, position) VALUES (?,?,?,?,?)', [
        slug,
        category.slug,
        name,
        description,
        position,
      ]);
      run('INSERT INTO skills (slug, name, category_slug) VALUES (?,?,?)', [slug, name, category.slug]);
    });
  }

  const adminId = insert(
    `INSERT INTO users (email, username, name, password_hash, role, bio, headline, instructor_status, plan, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      'admin@skillverse.app',
      'equipo',
      'Equipo SKILLVERSE',
      hashPassword(ADMIN_PASSWORD),
      'admin',
      'Equipo de operaciones de SKILLVERSE: moderación de contenido, revisión de cursos y soporte a la comunidad.',
      'Administración de la plataforma',
      'approved',
      'premium',
      createdAt,
    ]
  );

  const instructorId = insert(
    `INSERT INTO users (email, username, name, password_hash, role, bio, headline, avatar_url, location, website, instructor_status, instructor_application, plan, price_authorized, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      'valeria.demo@skillverse.app',
      'valeria-demo',
      'Valeria Demo',
      hashPassword(DEMO_PASSWORD),
      'instructor',
      'Cuenta de demostración de instructor. Publica cursos marcados como demostración para mostrar cómo funciona el estudio de creación dentro de SKILLVERSE.',
      'Instructora de demostración · diseño y web',
      '',
      'Remoto',
      '',
      'approved',
      'Cuenta creada automáticamente para demostrar el flujo de instructores.',
      'premium',
      1,
      createdAt,
    ]
  );

  const studentId = insert(
    `INSERT INTO users (email, username, name, password_hash, role, bio, headline, location, plan, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      'alumno.demo@skillverse.app',
      'alumno-demo',
      'Alumno Demo',
      hashPassword(DEMO_PASSWORD),
      'student',
      'Cuenta de demostración para explorar el aprendizaje, los proyectos y la comunidad.',
      'Aprendiendo diseño y desarrollo web',
      'Ciudad de México',
      'free',
      createdAt,
    ]
  );

  const skillRows = new Map();
  for (const skill of [
    ['desarrollo-web', 'intermedio'],
    ['ux-ui', 'avanzado'],
    ['inteligencia-artificial', 'aprendiendo'],
  ]) {
    const row = get('SELECT id FROM skills WHERE slug = ?', [skill[0]]);
    if (row) skillRows.set(skill[0], row.id);
  }
  for (const [slug, level] of [
    ['desarrollo-web', 'aprendiendo'],
    ['ux-ui', 'aprendiendo'],
  ]) {
    const id = skillRows.get(slug);
    if (id) run('INSERT INTO user_skills (user_id, skill_id, level, source, created_at) VALUES (?,?,?,?,?)', [studentId, id, level, 'manual', createdAt]);
  }
  for (const [slug, level] of [
    ['desarrollo-web', 'avanzado'],
    ['ux-ui', 'avanzado'],
    ['diseno-grafico', 'intermedio'],
  ]) {
    const row = get('SELECT id FROM skills WHERE slug = ?', [slug]);
    if (row) run('INSERT INTO user_skills (user_id, skill_id, level, source, created_at) VALUES (?,?,?,?,?)', [instructorId, row.id, level, 'manual', createdAt]);
  }

  run('INSERT INTO follows (follower_id, following_id, created_at) VALUES (?,?,?)', [studentId, instructorId, createdAt]);
  run('INSERT INTO follows (follower_id, following_id, created_at) VALUES (?,?,?)', [instructorId, studentId, createdAt]);

  const courses = [
    {
      slug: 'fundamentos-desarrollo-web',
      title: 'Fundamentos de desarrollo web: tu primera página',
      subtitle: 'HTML, CSS y JavaScript explicados desde cero',
      description:
        'Contenido de demostración. Un recorrido corto y práctico por las tres tecnologías que sostienen cualquier sitio web: HTML para la estructura, CSS para la presentación y JavaScript para la interacción. Al terminar sabrás leer y modificar una página real, y tendrás un ejercicio guiado para publicar la tuya.',
      gradient: 'aurora',
      category: 'tecnologia',
      subcategory: 'desarrollo-web',
      level: 'principiante',
      duration: 90,
      lessons: [
        {
          title: 'Cómo funciona la web',
          type: 'texto',
          duration: 12,
          summary: 'Cliente, servidor, HTTP y DNS sin tecnicismos innecesarios.',
          content:
            'Cuando escribes una dirección en el navegador ocurren tres cosas: se traduce el nombre del sitio a una dirección IP (DNS), se pide el documento al servidor (HTTP) y el navegador lo interpreta para dibujarlo en pantalla.\n\nEl cliente es tu navegador. El servidor es una computadora que responde a peticiones. Cada petición lleva un método (normalmente GET) y cada respuesta un código de estado: 200 significa que todo salió bien, 404 que el recurso no existe, 500 que algo falló del lado del servidor.\n\nUn sitio moderno suele combinar tres capas: HTML con el contenido, CSS con los estilos y JavaScript con el comportamiento. Separarlas te permite cambiar una sin romper las otras.\n\nEjercicio rápido: abre las herramientas de desarrollo de tu navegador (F12), entra en la pestaña Red y recarga esta página. Observa cuántas peticiones se hacen y qué código de estado devuelve cada una.',
        },
        {
          title: 'Estructura con HTML',
          type: 'texto',
          duration: 18,
          summary: 'Etiquetas semánticas y jerarquía de contenido.',
          content:
            'HTML describe la estructura del contenido. Un documento mínimo tiene una declaración de tipo, un elemento html, un head con metadatos y un body con lo visible.\n\nUsa etiquetas por su significado, no por su apariencia: header para la cabecera, nav para la navegación, main para el contenido principal, section y article para agrupar, footer para el cierre. Los encabezados h1 a h6 crean jerarquía, y solo debería existir un h1 por página.\n\nLa semántica importa por accesibilidad: los lectores de pantalla navegan por encabezados y regiones. También importa para el SEO y para que otras personas entiendan tu código.\n\nEjemplo de estructura correcta:\n\n<header>\n  <h1>Mi portafolio</h1>\n  <nav><a href="#proyectos">Proyectos</a></nav>\n</header>\n<main>\n  <section id="proyectos">\n    <h2>Proyectos</h2>\n    <article><h3>Landing de cafetería</h3></article>\n  </section>\n</main>\n<footer><p>© 2026</p></footer>',
        },
        {
          title: 'Estilo con CSS',
          type: 'texto',
          duration: 20,
          summary: 'Selectores, caja, flexbox y diseño responsive.',
          content:
            'CSS decide cómo se ve la estructura. Un selector elige elementos y un bloque de declaraciones define propiedades. Empieza por el modelo de caja: todo elemento es una caja con contenido, padding, borde y margen.\n\nPara maquetar, flexbox resuelve filas y columnas con alineación sencilla; grid es mejor para composiciones bidimensionales. El diseño responsive se construye con unidades relativas (rem, %, vh) y media queries que ajustan el layout según el ancho.\n\nBuenas prácticas: define variables para colores y espaciados, usa una escala tipográfica coherente y evita valores mágicos repetidos. Comprueba siempre el contraste del texto sobre el fondo.\n\nEjemplo:\n\n:root { --acento: #8b5cf6; }\n.tarjeta {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  padding: 20px;\n  border-radius: 16px;\n  background: #0f172a;\n  color: #e2e8f0;\n}\n@media (max-width: 640px) {\n  .tarjeta { padding: 14px; }\n}',
        },
        {
          title: 'Interacción con JavaScript',
          type: 'texto',
          duration: 22,
          summary: 'DOM, eventos y estado mínimo.',
          content:
            'JavaScript añade comportamiento. El navegador expone el DOM, un árbol de nodos que puedes consultar y modificar. Los eventos conectan acciones del usuario con funciones.\n\nUn patrón habitual: seleccionar un elemento, escuchar un evento y actualizar el DOM o el estado.\n\nconst boton = document.querySelector("#tema");\nboton.addEventListener("click", () => {\n  document.body.classList.toggle("claro");\n});\n\nCuando la interfaz crece, conviene mantener el estado en un objeto y renderizar a partir de él, en lugar de leer y escribir el DOM en muchos lugares. Ese es el principio que siguen React, Vue y Svelte.\n\nErrores frecuentes: ejecutar el script antes de que exista el HTML (usa defer), comparar con == en lugar de ===, y olvidar manejar los errores de una petición de red.',
        },
        {
          title: 'Ejercicio: publica tu primera página',
          type: 'ejercicio',
          duration: 18,
          summary: 'Construye una página personal de una sección y publícala.',
          content:
            'Objetivo: crear una página de presentación de una sola sección y publicarla en un servicio de hosting estático gratuito.\n\nPasos:\n1. Crea una carpeta con index.html y estilos.css.\n2. Incluye un header con tu nombre, un main con dos párrafos sobre lo que quieres aprender y un footer con un enlace a tu perfil de SKILLVERSE.\n3. Aplica una paleta de tres colores y una tipografía legible.\n4. Comprueba que se ve bien a 390 px de ancho.\n5. Publica el resultado (por ejemplo con GitHub Pages) y sube el enlace como proyecto en el Laboratorio de SKILLVERSE, categoría Desarrollo web.\n\nCriterios de revisión: estructura semántica, contraste suficiente, diseño adaptable y enlace funcionando.',
        },
      ],
      quiz: {
        title: 'Evaluación: fundamentos web',
        description: 'Cinco preguntas para comprobar lo esencial del curso.',
        pass_score: 70,
        questions: [
          {
            prompt: '¿Qué tecnología define la estructura del contenido?',
            options: ['CSS', 'HTML', 'JavaScript', 'SQL'],
            correct: 1,
            explanation: 'HTML describe la estructura y el significado del contenido.',
          },
          {
            prompt: 'Un código de estado HTTP 404 significa que…',
            options: ['El servidor falló', 'La petición fue correcta', 'El recurso no existe', 'Falta autenticación'],
            correct: 2,
            explanation: '404 indica que el recurso solicitado no se encontró.',
          },
          {
            prompt: '¿Qué propiedad de CSS distribuye elementos en una fila con flexbox?',
            options: ['display: flex', 'position: fixed', 'float: left', 'grid-template'],
            correct: 0,
            explanation: 'display: flex activa el modelo de caja flexible en el contenedor.',
          },
          {
            prompt: '¿Cuál es una buena práctica de accesibilidad?',
            options: ['Usar imágenes como botones', 'Mantener una jerarquía de encabezados', 'Ocultar el foco del teclado', 'Texto gris claro sobre blanco'],
            correct: 1,
            explanation: 'La jerarquía de encabezados permite navegar con lectores de pantalla.',
          },
          {
            prompt: '¿Dónde conviene guardar el estado de una interfaz que crece?',
            options: ['En variables globales sueltas', 'En el DOM únicamente', 'En un objeto de estado y renderizar desde él', 'En comentarios HTML'],
            correct: 2,
            explanation: 'Centralizar el estado y renderizar a partir de él evita inconsistencias.',
          },
        ],
      },
    },
    {
      slug: 'diseno-ux-ui-personas',
      title: 'Diseño UX/UI: piensa en las personas primero',
      subtitle: 'Investigación ligera, flujos y wireframes',
      description:
        'Contenido de demostración. Un curso introductorio para distinguir experiencia de interfaz, hacer investigación de usuarios con recursos limitados y convertir hallazgos en wireframes probables. Incluye una evaluación y un ejercicio de rediseño con criterios verificables.',
      gradient: 'violet',
      category: 'diseno',
      subcategory: 'ux-ui',
      level: 'intermedio',
      duration: 75,
      lessons: [
        {
          title: 'Qué es UX y qué es UI',
          type: 'texto',
          duration: 12,
          summary: 'Dos disciplinas que se complementan.',
          content:
            'La experiencia de usuario (UX) estudia cómo una persona logra un objetivo con un producto: qué necesita, qué la confunde y qué la hace volver. La interfaz (UI) es la capa visible con la que interactúa: tipografía, color, espaciado, componentes y estados.\n\nUn buen diseño de interfaz no arregla una experiencia rota. Si el flujo de compra pide cinco pasos innecesarios, un botón bonito no lo salva.\n\nVocabulario útil:\n- Flujo: secuencia de pantallas para completar una tarea.\n- Wireframe: esquema de bajo detalle que define jerarquía y estructura.\n- Prototipo: versión navegable para probar el flujo.\n- Heurística: regla de evaluación basada en evidencia acumulada.\n\nAntes de abrir tu herramienta de diseño, escribe en una frase qué problema resuelve la pantalla y para quién.',
        },
        {
          title: 'Investigación rápida de usuarios',
          type: 'texto',
          duration: 20,
          summary: 'Cinco entrevistas valen más que una opinión.',
          content:
            'No necesitas un laboratorio para investigar. Con cinco conversaciones bien hechas detectas patrones sobre un flujo concreto.\n\nReglas básicas: pregunta por experiencias pasadas, no por deseos futuros. "Cuéntame la última vez que buscaste un curso" funciona mejor que "¿usarías esta función?". Evita inducir la respuesta y deja silencios para que la persona complete su idea.\n\nRegistra citas literales, no interpretaciones. Después agrupa en temas y cuantifica cuántas personas mencionaron cada uno. Un hallazgo sólido aparece en varias conversaciones.\n\nSesgos a vigilar: hablar solo con personas parecidas a ti, confundir lo que dice la gente con lo que hace, y generalizar a partir de una única entrevista.\n\nEntregable del módulo: un documento de una página con tres hallazgos, dos citas y una decisión de diseño por hallazgo.',
        },
        {
          title: 'Wireframes y jerarquía visual',
          type: 'texto',
          duration: 18,
          summary: 'Estructura antes de estética.',
          content:
            'Un wireframe define qué aparece, en qué orden y con qué peso. Se hace en gris, sin imágenes finales, para discutir estructura sin distracciones.\n\nPrincipios de jerarquía: tamaño, contraste, posición y espacio. Un solo elemento debe dominar cada pantalla; si todo grita, nada se escucha. Agrupa lo relacionado con proximidad y separa lo distinto con espacio, no solo con líneas.\n\nEstados obligatorios en cualquier wireframe: vacío, cargando, error y éxito. La mayoría de los problemas de usabilidad aparecen en esos estados, no en el camino ideal.\n\nEjercicio de escritorio: dibuja en papel tres versiones del mismo flujo de inscripción. Al lado de cada una, anota qué decisión tomaste y por qué.',
        },
        {
          title: 'Ejercicio: rediseña una pantalla real',
          type: 'ejercicio',
          duration: 25,
          summary: 'Audita, rediseña y documenta una pantalla.',
          content:
            'Elige una pantalla de una aplicación que uses a diario.\n\n1. Audita: anota cinco fricciones concretas (no "es fea").\n2. Prioriza: ordena por impacto en la tarea principal.\n3. Rediseña: crea un wireframe en gris con estados vacío, error y éxito.\n4. Documenta: explica cada cambio y qué evidencia lo respalda.\n5. Publica: sube el wireframe y la explicación al Laboratorio de SKILLVERSE, categoría UX/UI.\n\nCriterios de revisión: jerarquía clara, estados completos, decisiones justificadas y texto legible a 390 px.',
        },
      ],
      quiz: {
        title: 'Evaluación: criterios de UX/UI',
        description: 'Comprueba que distingues experiencia, interfaz y evidencia.',
        pass_score: 70,
        questions: [
          {
            prompt: '¿Cuál de estas tareas pertenece a UX y no a UI?',
            options: ['Elegir la tipografía', 'Definir la secuencia de pasos de compra', 'Ajustar el contraste de un botón', 'Crear los iconos'],
            correct: 1,
            explanation: 'La secuencia de pasos es un flujo: territorio de experiencia de usuario.',
          },
          {
            prompt: '¿Qué pregunta obtiene información más fiable en una entrevista?',
            options: ['¿Te gustaría esta función?', '¿Usarías una app así?', 'Cuéntame la última vez que hiciste esta tarea', '¿Cuánto pagarías?'],
            correct: 2,
            explanation: 'Preguntar por experiencias pasadas reduce la especulación.',
          },
          {
            prompt: '¿Qué estado suele olvidarse en los wireframes?',
            options: ['Estado vacío', 'Pantalla de inicio', 'Botón principal', 'Logotipo'],
            correct: 0,
            explanation: 'Los estados vacíos, de error y de carga son los más olvidados.',
          },
          {
            prompt: 'Un wireframe debe…',
            options: ['Incluir fotos finales', 'Definir estructura y jerarquía', 'Usar la paleta definitiva', 'Ser un prototipo interactivo'],
            correct: 1,
            explanation: 'El wireframe trabaja estructura y jerarquía sin detalle visual final.',
          },
        ],
      },
    },
    {
      slug: 'ia-aplicada-con-criterio',
      title: 'IA aplicada: usa modelos de lenguaje con criterio',
      subtitle: 'Qué pueden hacer, dónde fallan y cómo verificar',
      description:
        'Contenido de demostración. Curso breve sobre el uso responsable de modelos de lenguaje: límites reales, diseño de instrucciones claras, verificación de respuestas y construcción de un asistente de estudio propio. No requiere programar.',
      gradient: 'teal',
      category: 'tecnologia',
      subcategory: 'inteligencia-artificial',
      level: 'principiante',
      duration: 60,
      lessons: [
        {
          title: 'Qué puede y qué no puede hacer un modelo de lenguaje',
          type: 'texto',
          duration: 15,
          summary: 'Capacidades reales frente a expectativas infladas.',
          content:
            'Un modelo de lenguaje predice texto plausible a partir de un contexto. Eso le permite resumir, reescribir, clasificar, traducir y generar borradores. No consulta una base de datos de verdades: cuando no sabe, puede producir una respuesta fluida pero incorrecta.\n\nCapacidades razonables: transformar texto, proponer estructuras, explicar un concepto a distintos niveles y generar variaciones.\n\nLímites importantes: no garantiza exactitud factual, no conoce hechos posteriores a su entrenamiento, no ejecuta acciones en el mundo real por sí solo y no sustituye una fuente primaria.\n\nRegla práctica: usa el modelo para acelerar el trabajo, no para decidir sin revisar. Todo dato que vaya a publicarse debe verificarse en una fuente citable.\n\nNunca introduzcas datos personales de terceros, credenciales ni información confidencial en un servicio externo sin autorización.',
        },
        {
          title: 'Instrucciones claras y contexto útil',
          type: 'texto',
          duration: 20,
          summary: 'Cómo escribir prompts que producen resultados revisables.',
          content:
            'Una instrucción útil incluye: objetivo, contexto, formato de salida y criterios de calidad. Cuanto más específico el pedido, más fácil revisar el resultado.\n\nDébil: "háblame de bases de datos".\nMejor: "explica la diferencia entre una clave primaria y una foránea a una persona que empieza, en menos de 150 palabras, con un ejemplo de dos tablas y sin jerga innecesaria".\n\nAñade ejemplos cuando el formato importe. Pide que el modelo declare supuestos y que indique qué información le falta. Si la tarea es crítica, solicita dos versiones con enfoques distintos para comparar.\n\nErrores comunes: pedir "lo mejor" sin definir qué significa, mezclar tres tareas en un mensaje y aceptar la primera respuesta sin comprobarla.\n\nBuenas prácticas de privacidad: anonimiza nombres y datos, y no pegues documentos con información sensible.',
        },
        {
          title: 'Verificación y uso responsable',
          type: 'texto',
          duration: 12,
          summary: 'Contrastar, citar y reconocer el uso de IA.',
          content:
            'Verificar es parte del trabajo. Para cualquier afirmación factual, busca una fuente primaria y comprueba que dice lo que el modelo afirmó. Si no encuentras respaldo, trátalo como hipótesis.\n\nSeñales de alerta: cifras sin origen, citas con formato perfecto pero inexistentes, referencias a estudios vagos y seguridad excesiva en temas discutidos.\n\nTransparencia: cuando entregues un trabajo, indica qué partes se apoyaron en IA y cómo las revisaste. Muchas instituciones y clientes ya lo exigen.\n\nAutomatización con límites: no delegues decisiones sobre personas (selección, evaluación, moderación) sin revisión humana y sin posibilidad de apelación.\n\nCierra el módulo escribiendo tu propia lista de tres comprobaciones antes de publicar algo generado con IA.',
        },
        {
          title: 'Ejercicio: diseña tu asistente de estudio',
          type: 'ejercicio',
          duration: 13,
          summary: 'Define un asistente con reglas y criterios claros.',
          content:
            'Diseña la ficha de un asistente de estudio para una materia que estés aprendiendo.\n\nIncluye:\n1. Objetivo del asistente en una frase.\n2. Nivel del estudiante al que se adapta.\n3. Tres reglas (por ejemplo: pedir el nivel antes de explicar, no inventar fuentes, proponer un ejercicio al final).\n4. Formato de respuesta esperado.\n5. Cómo comprobarás que la respuesta es correcta.\n\nPublica la ficha como proyecto en el Laboratorio, categoría Inteligencia artificial, y pruébala con el Asistente de SKILLVERSE comparando tres respuestas.',
        },
      ],
      quiz: {
        title: 'Evaluación: uso crítico de IA',
        description: 'Comprueba los límites y las buenas prácticas.',
        pass_score: 70,
        questions: [
          {
            prompt: '¿Qué hace realmente un modelo de lenguaje?',
            options: ['Consulta una base de datos de verdades', 'Predice texto plausible a partir del contexto', 'Verifica automáticamente las fuentes', 'Accede a internet sin configuración'],
            correct: 1,
            explanation: 'Genera texto probable; la exactitud no está garantizada.',
          },
          {
            prompt: '¿Qué debe incluir una buena instrucción?',
            options: ['Solo el tema', 'Objetivo, contexto y formato esperado', 'Muchas palabras clave', 'Una petición de "lo mejor"'],
            correct: 1,
            explanation: 'Objetivo, contexto, formato y criterios hacen el resultado revisable.',
          },
          {
            prompt: 'Antes de publicar un dato generado con IA debes…',
            options: ['Confiar si suena seguro', 'Verificarlo en una fuente primaria', 'Pedirlo dos veces', 'Traducirlo'],
            correct: 1,
            explanation: 'La verificación en fuentes primarias es imprescindible.',
          },
          {
            prompt: '¿Qué información no deberías pegar en un servicio externo?',
            options: ['Un texto público', 'Datos personales o confidenciales', 'Una pregunta general', 'Tu lista de tareas sin datos'],
            correct: 1,
            explanation: 'Los datos personales y confidenciales requieren autorización y protección.',
          },
        ],
      },
    },
  ];

  for (const course of courses) {
    const courseId = insert(
      `INSERT INTO courses (slug, title, subtitle, description, cover_gradient, category_slug, subcategory_slug, level, duration_minutes, language, instructor_id, status, price_cents, is_premium, is_demo, created_at, updated_at, published_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        course.slug,
        course.title,
        course.subtitle,
        course.description,
        course.gradient,
        course.category,
        course.subcategory,
        course.level,
        course.duration,
        'Español',
        instructorId,
        'published',
        0,
        0,
        1,
        createdAt,
        createdAt,
        createdAt,
      ]
    );

    course.lessons.forEach((lesson, index) => {
      insert(
        `INSERT INTO lessons (course_id, position, title, summary, type, content, video_url, duration_minutes, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [courseId, index + 1, lesson.title, lesson.summary, lesson.type, lesson.content, '', lesson.duration, createdAt]
      );
    });

    insert('INSERT INTO resources (course_id, lesson_id, title, url, kind, created_at) VALUES (?,?,?,?,?,?)', [
      courseId,
      null,
      'Guía de estudio en PDF (recurso de ejemplo)',
      'https://developer.mozilla.org/es/docs/Learn',
      'enlace',
      createdAt,
    ]);

    const quizId = insert('INSERT INTO quizzes (course_id, title, description, pass_score, created_at) VALUES (?,?,?,?,?)', [
      courseId,
      course.quiz.title,
      course.quiz.description,
      course.quiz.pass_score,
      createdAt,
    ]);
    course.quiz.questions.forEach((question, index) => {
      insert(
        'INSERT INTO quiz_questions (quiz_id, position, prompt, options, correct_index, explanation) VALUES (?,?,?,?,?,?)',
        [quizId, index + 1, question.prompt, JSON.stringify(question.options), question.correct, question.explanation]
      );
    });
  }

  const webCourse = get('SELECT id FROM courses WHERE slug = ?', ['fundamentos-desarrollo-web']);

  const groupId = insert(
    'INSERT INTO groups (slug, name, description, category_slug, owner_id, is_demo, created_at) VALUES (?,?,?,?,?,?,?)',
    [
      'aprendices-tecnologia',
      'Aprendices de tecnología',
      'Grupo de demostración para compartir dudas, recursos y avances en programación y desarrollo web.',
      'tecnologia',
      instructorId,
      1,
      createdAt,
    ]
  );
  run('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)', [groupId, instructorId, 'admin', createdAt]);
  run('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?,?,?,?)', [groupId, studentId, 'miembro', createdAt]);

  const challengeId = insert(
    'INSERT INTO challenges (slug, title, description, category_slug, deadline, reward, status, is_demo, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [
      'reto-portafolio-7-dias',
      'Reto: tu portafolio en 7 días',
      'Publica una pieza nueva cada día durante una semana: una portada, un caso de estudio, un wireframe, un prototipo y una reflexión final. Comparte el avance en la comunidad con la etiqueta #RetoPortafolio.',
      'diseno',
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      'Insignia de desafío completado y destacado en el muro de la comunidad.',
      'activo',
      1,
      createdAt,
    ]
  );

  insert('INSERT INTO posts (user_id, kind, title, body, group_id, challenge_id, is_demo, created_at) VALUES (?,?,?,?,?,?,?,?)', [
    instructorId,
    'post',
    'Cómo aprovechar el Laboratorio de proyectos',
    'El Laboratorio no es un lugar para publicar solo trabajos terminados. Sube también bocetos, iteraciones y aprendizajes. Un proyecto con tres versiones y una reflexión explica más que una imagen perfecta sin contexto.\n\nRecomendación: escribe qué problema resolvías, qué decisión tomaste y qué harías distinto. Ese formato es el que revisan las personas que buscan colaboradores.',
    null,
    null,
    1,
    createdAt,
  ]);

  insert('INSERT INTO posts (user_id, kind, title, body, group_id, challenge_id, is_demo, created_at) VALUES (?,?,?,?,?,?,?,?)', [
    studentId,
    'question',
    '¿Cómo organizan su tiempo para practicar?',
    'Estoy empezando con desarrollo web y me cuesta mantener una rutina. ¿Usan bloques de tiempo, proyectos pequeños o desafíos semanales? Me interesa saber qué les funcionó de verdad.',
    groupId,
    null,
    1,
    new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  ]);

  const post = get('SELECT id FROM posts WHERE kind = ?', ['question']);
  if (post) {
    insert('INSERT INTO comments (post_id, user_id, parent_id, body, accepted, created_at) VALUES (?,?,?,?,?,?)', [
      post.id,
      instructorId,
      null,
      'A mí me funcionó fijar dos sesiones de 45 minutos por semana y cerrar cada una con algo publicado, aunque sea pequeño. La constancia importa más que la duración.',
      1,
      new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    ]);
  }

  if (webCourse) {
    insert(
      'INSERT INTO projects (user_id, title, description, category_slug, link, cover_url, challenge_id, is_demo, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [
        studentId,
        'Landing de cafetería local (proyecto de demostración)',
        'Proyecto de ejemplo para mostrar el formato del Laboratorio: problema, decisiones y resultado. Diseñé una landing de una sección para una cafetería de barrio, con menú, horarios y formulario de contacto. Iteré dos versiones: la primera tenía demasiado texto y la segunda prioriza el menú y la ubicación.',
        'desarrollo-web',
        'https://developer.mozilla.org/es/docs/Learn',
        '',
        challengeId,
        1,
        createdAt,
      ]
    );
  }

  run('INSERT INTO ads (title, body, url, category_slug, status, impressions, clicks, created_at) VALUES (?,?,?,?,?,?,?,?)', [
    'Anuncio de demostración: taller de portafolio',
    'Espacio publicitario moderado de ejemplo. En producción solo se muestran anuncios revisados por administración y nunca a cuentas Premium.',
    '',
    'diseno',
    'approved',
    0,
    0,
    createdAt,
  ]);
  run('INSERT INTO ads (title, body, url, category_slug, status, impressions, clicks, created_at) VALUES (?,?,?,?,?,?,?,?)', [
    'Anuncio pendiente de revisión (ejemplo)',
    'Este anuncio está en estado pendiente para que puedas probar la moderación desde el panel administrativo.',
    '',
    'negocios',
    'pending',
    0,
    0,
    createdAt,
  ]);

  return { seeded: true, adminEmail: 'admin@skillverse.app', demoEmail: 'valeria.demo@skillverse.app' };
}
