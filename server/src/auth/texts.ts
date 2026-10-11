import type { BuiltInRoleId, LocalizedText, Permission, PermissionInfo } from '../../../shared/types.js';
import { localize } from '../plugins/manifest.js';
import { PERMISSIONS } from './permissions.js';

// Texts the server sends for permissions and built-in roles, in every UI language (machine translations
// except English and Ukrainian, awaiting review like the client catalogs).

const PERMISSION_TEXTS: Record<Permission, { label: LocalizedText; description: LocalizedText }> = {
  'library.view': {
    label: {
      en: 'View the library', uk: 'Перегляд бібліотеки', ru: 'Просмотр библиотеки', de: 'Bibliothek ansehen', fr: 'Voir la photothèque',
      es: 'Ver la biblioteca', 'pt-BR': 'Ver a biblioteca', ar: 'عرض المكتبة', id: 'Melihat pustaka', ja: 'ライブラリの閲覧', 'zh-Hans': '查看图库',
    },
    description: {
      en: 'See photos, folders, albums, tags, people, places, memories and statistics.',
      uk: 'Бачити фото, папки, альбоми, теги, людей, місця, спогади та статистику.',
      ru: 'Видеть фото, папки, альбомы, теги, людей, места, воспоминания и статистику.',
      de: 'Fotos, Ordner, Alben, Tags, Personen, Orte, Erinnerungen und Statistiken sehen.',
      fr: 'Voir les photos, dossiers, albums, tags, personnes, lieux, souvenirs et statistiques.',
      es: 'Ver fotos, carpetas, álbumes, etiquetas, personas, lugares, recuerdos y estadísticas.',
      'pt-BR': 'Ver fotos, pastas, álbuns, tags, pessoas, lugares, memórias e estatísticas.',
      ar: 'رؤية الصور والمجلدات والألبومات والوسوم والأشخاص والأماكن والذكريات والإحصاءات.',
      id: 'Melihat foto, folder, album, tag, orang, tempat, kenangan, dan statistik.',
      ja: '写真、フォルダー、アルバム、タグ、人物、場所、思い出、統計を表示します。',
      'zh-Hans': '查看照片、文件夹、相册、标签、人物、地点、回忆和统计。',
    },
  },
  'photos.edit': {
    label: {
      en: 'Edit photos', uk: 'Редагування фото', ru: 'Редактирование фото', de: 'Fotos bearbeiten', fr: 'Modifier les photos',
      es: 'Editar fotos', 'pt-BR': 'Editar fotos', ar: 'تحرير الصور', id: 'Mengedit foto', ja: '写真の編集', 'zh-Hans': '编辑照片',
    },
    description: {
      en: 'Star photos and change their description, tags, edits and location.',
      uk: 'Позначати фото зірочкою та змінювати їхній опис, теги, правки й місце.',
      ru: 'Отмечать фото звёздочкой и менять их описание, теги, правки и место.',
      de: 'Fotos mit Stern markieren und Beschreibung, Tags, Bearbeitungen und Ort ändern.',
      fr: 'Marquer les photos d’une étoile et modifier leur description, tags, retouches et lieu.',
      es: 'Marcar fotos con estrella y cambiar su descripción, etiquetas, ediciones y ubicación.',
      'pt-BR': 'Marcar fotos com estrela e alterar descrição, tags, edições e localização.',
      ar: 'تمييز الصور بنجمة وتغيير وصفها ووسومها وتعديلاتها وموقعها.',
      id: 'Memberi bintang pada foto dan mengubah deskripsi, tag, suntingan, dan lokasinya.',
      ja: '写真にスターを付け、説明、タグ、編集、位置を変更します。',
      'zh-Hans': '为照片加星标，并更改其描述、标签、编辑和位置。',
    },
  },
  'albums.manage': {
    label: {
      en: 'Manage albums', uk: 'Керування альбомами', ru: 'Управление альбомами', de: 'Alben verwalten', fr: 'Gérer les albums',
      es: 'Gestionar álbumes', 'pt-BR': 'Gerenciar álbuns', ar: 'إدارة الألبومات', id: 'Mengelola album', ja: 'アルバムの管理', 'zh-Hans': '管理相册',
    },
    description: {
      en: 'Create, change and delete albums and add or remove their photos.',
      uk: 'Створювати, змінювати й видаляти альбоми та додавати чи прибирати з них фото.',
      ru: 'Создавать, изменять и удалять альбомы и добавлять или убирать из них фото.',
      de: 'Alben anlegen, ändern und löschen sowie Fotos hinzufügen oder entfernen.',
      fr: 'Créer, modifier et supprimer des albums et y ajouter ou retirer des photos.',
      es: 'Crear, cambiar y eliminar álbumes y añadir o quitar sus fotos.',
      'pt-BR': 'Criar, alterar e excluir álbuns e adicionar ou remover suas fotos.',
      ar: 'إنشاء الألبومات وتغييرها وحذفها وإضافة صورها أو إزالتها.',
      id: 'Membuat, mengubah, dan menghapus album serta menambah atau menghapus fotonya.',
      ja: 'アルバムを作成、変更、削除し、写真を追加または削除します。',
      'zh-Hans': '创建、更改和删除相册，并添加或移除其中的照片。',
    },
  },
  'people.manage': {
    label: {
      en: 'Manage people', uk: 'Керування людьми', ru: 'Управление людьми', de: 'Personen verwalten', fr: 'Gérer les personnes',
      es: 'Gestionar personas', 'pt-BR': 'Gerenciar pessoas', ar: 'إدارة الأشخاص', id: 'Mengelola orang', ja: '人物の管理', 'zh-Hans': '管理人物',
    },
    description: {
      en: 'Add, change and delete people, assign faces and find faces.',
      uk: 'Додавати, змінювати й видаляти людей, призначати обличчя та шукати обличчя.',
      ru: 'Добавлять, изменять и удалять людей, назначать лица и искать лица.',
      de: 'Personen hinzufügen, ändern und löschen, Gesichter zuordnen und Gesichter suchen.',
      fr: 'Ajouter, modifier et supprimer des personnes, attribuer et rechercher des visages.',
      es: 'Añadir, cambiar y eliminar personas, asignar caras y buscar caras.',
      'pt-BR': 'Adicionar, alterar e excluir pessoas, atribuir rostos e encontrar rostos.',
      ar: 'إضافة الأشخاص وتغييرهم وحذفهم وتعيين الوجوه والبحث عن الوجوه.',
      id: 'Menambah, mengubah, dan menghapus orang, menetapkan wajah, dan mencari wajah.',
      ja: '人物を追加、変更、削除し、顔を割り当て、顔を検出します。',
      'zh-Hans': '添加、更改和删除人物，分配人脸并查找人脸。',
    },
  },
  export: {
    label: {
      en: 'Export', uk: 'Експорт', ru: 'Экспорт', de: 'Exportieren', fr: 'Exporter',
      es: 'Exportar', 'pt-BR': 'Exportar', ar: 'التصدير', id: 'Ekspor', ja: 'エクスポート', 'zh-Hans': '导出',
    },
    description: {
      en: 'Export photos and make movies.',
      uk: 'Експортувати фото та створювати фільми.',
      ru: 'Экспортировать фото и создавать фильмы.',
      de: 'Fotos exportieren und Filme erstellen.',
      fr: 'Exporter des photos et créer des films.',
      es: 'Exportar fotos y crear películas.',
      'pt-BR': 'Exportar fotos e criar filmes.',
      ar: 'تصدير الصور وإنشاء الأفلام.',
      id: 'Mengekspor foto dan membuat film.',
      ja: '写真をエクスポートし、ムービーを作成します。',
      'zh-Hans': '导出照片并制作影片。',
    },
  },
  'account.tokens': {
    label: {
      en: 'API tokens', uk: 'API-токени', ru: 'API-токены', de: 'API-Token', fr: 'Jetons d’API',
      es: 'Tokens de API', 'pt-BR': 'Tokens de API', ar: 'رموز API', id: 'Token API', ja: 'API トークン', 'zh-Hans': 'API 令牌',
    },
    description: {
      en: 'Create personal API tokens for scripts and other apps.',
      uk: 'Створювати особисті API-токени для скриптів та інших застосунків.',
      ru: 'Создавать личные API-токены для скриптов и других приложений.',
      de: 'Persönliche API-Token für Skripte und andere Apps erstellen.',
      fr: 'Créer des jetons d’API personnels pour des scripts et d’autres applications.',
      es: 'Crear tokens de API personales para scripts y otras aplicaciones.',
      'pt-BR': 'Criar tokens de API pessoais para scripts e outros aplicativos.',
      ar: 'إنشاء رموز API شخصية للبرامج النصية والتطبيقات الأخرى.',
      id: 'Membuat token API pribadi untuk skrip dan aplikasi lain.',
      ja: 'スクリプトや他のアプリ用の個人 API トークンを作成します。',
      'zh-Hans': '为脚本和其他应用创建个人 API 令牌。',
    },
  },
  'plugins.manage': {
    label: {
      en: 'Manage plugins', uk: 'Керування плагінами', ru: 'Управление плагинами', de: 'Plugins verwalten', fr: 'Gérer les extensions',
      es: 'Gestionar complementos', 'pt-BR': 'Gerenciar plugins', ar: 'إدارة الإضافات', id: 'Mengelola plugin', ja: 'プラグインの管理', 'zh-Hans': '管理插件',
    },
    description: {
      en: 'Switch plugins on and off, including login methods.',
      uk: 'Вмикати й вимикати плагіни, зокрема способи входу.',
      ru: 'Включать и выключать плагины, в том числе способы входа.',
      de: 'Plugins ein- und ausschalten, auch Anmeldemethoden.',
      fr: 'Activer et désactiver les extensions, y compris les méthodes de connexion.',
      es: 'Activar y desactivar complementos, incluidos los métodos de inicio de sesión.',
      'pt-BR': 'Ativar e desativar plugins, incluindo métodos de login.',
      ar: 'تشغيل الإضافات وإيقافها، بما في ذلك طرق تسجيل الدخول.',
      id: 'Mengaktifkan dan menonaktifkan plugin, termasuk metode masuk.',
      ja: 'ログイン方法を含むプラグインのオン・オフを切り替えます。',
      'zh-Hans': '开启和关闭插件，包括登录方式。',
    },
  },
  'users.manage': {
    label: {
      en: 'Manage users', uk: 'Керування користувачами', ru: 'Управление пользователями', de: 'Benutzer verwalten', fr: 'Gérer les utilisateurs',
      es: 'Gestionar usuarios', 'pt-BR': 'Gerenciar usuários', ar: 'إدارة المستخدمين', id: 'Mengelola pengguna', ja: 'ユーザーの管理', 'zh-Hans': '管理用户',
    },
    description: {
      en: 'Manage users, roles, and the sessions and tokens of everyone. Always sees the whole library.',
      uk: 'Керувати користувачами, ролями, сесіями й токенами всіх. Завжди бачить усю бібліотеку.',
      ru: 'Управлять пользователями, ролями, сессиями и токенами всех. Всегда видит всю библиотеку.',
      de: 'Benutzer, Rollen sowie Sitzungen und Token aller verwalten. Sieht immer die ganze Bibliothek.',
      fr: 'Gérer les utilisateurs, les rôles, ainsi que les sessions et jetons de tous. Voit toujours toute la photothèque.',
      es: 'Gestionar usuarios, roles y las sesiones y tokens de todos. Siempre ve toda la biblioteca.',
      'pt-BR': 'Gerenciar usuários, funções e as sessões e tokens de todos. Sempre vê a biblioteca inteira.',
      ar: 'إدارة المستخدمين والأدوار وجلسات الجميع ورموزهم. يرى المكتبة كاملة دائمًا.',
      id: 'Mengelola pengguna, peran, serta sesi dan token semua orang. Selalu melihat seluruh pustaka.',
      ja: 'ユーザー、ロール、全員のセッションとトークンを管理します。常にライブラリ全体を表示できます。',
      'zh-Hans': '管理用户、角色以及所有人的会话和令牌。始终可以看到整个图库。',
    },
  },
};

const ROLE_TEXTS: Record<BuiltInRoleId, { name: LocalizedText; description: LocalizedText }> = {
  admin: {
    name: {
      en: 'Administrator', uk: 'Адміністратор', ru: 'Администратор', de: 'Administrator', fr: 'Administrateur',
      es: 'Administrador', 'pt-BR': 'Administrador', ar: 'مسؤول', id: 'Administrator', ja: '管理者', 'zh-Hans': '管理员',
    },
    description: {
      en: 'Everything, including users and plugins.',
      uk: 'Усе, зокрема користувачі та плагіни.',
      ru: 'Всё, включая пользователей и плагины.',
      de: 'Alles, auch Benutzer und Plugins.',
      fr: 'Tout, y compris les utilisateurs et les extensions.',
      es: 'Todo, incluidos los usuarios y los complementos.',
      'pt-BR': 'Tudo, incluindo usuários e plugins.',
      ar: 'كل شيء، بما في ذلك المستخدمون والإضافات.',
      id: 'Semuanya, termasuk pengguna dan plugin.',
      ja: 'ユーザーとプラグインを含むすべて。',
      'zh-Hans': '全部，包括用户和插件。',
    },
  },
  editor: {
    name: {
      en: 'Editor', uk: 'Редактор', ru: 'Редактор', de: 'Bearbeiter', fr: 'Éditeur',
      es: 'Editor', 'pt-BR': 'Editor', ar: 'محرر', id: 'Editor', ja: '編集者', 'zh-Hans': '编辑者',
    },
    description: {
      en: 'Views and changes the library, exports, and creates API tokens.',
      uk: 'Переглядає та змінює бібліотеку, експортує, створює API-токени.',
      ru: 'Просматривает и изменяет библиотеку, экспортирует, создаёт API-токены.',
      de: 'Sieht und ändert die Bibliothek, exportiert und erstellt API-Token.',
      fr: 'Voit et modifie la photothèque, exporte et crée des jetons d’API.',
      es: 'Ve y cambia la biblioteca, exporta y crea tokens de API.',
      'pt-BR': 'Vê e altera a biblioteca, exporta e cria tokens de API.',
      ar: 'يعرض المكتبة ويغيّرها ويصدّر وينشئ رموز API.',
      id: 'Melihat dan mengubah pustaka, mengekspor, dan membuat token API.',
      ja: 'ライブラリの閲覧と変更、エクスポート、API トークンの作成ができます。',
      'zh-Hans': '查看和更改图库、导出并创建 API 令牌。',
    },
  },
  viewer: {
    name: {
      en: 'Viewer', uk: 'Глядач', ru: 'Зритель', de: 'Betrachter', fr: 'Lecteur',
      es: 'Espectador', 'pt-BR': 'Visualizador', ar: 'مشاهد', id: 'Penonton', ja: '閲覧者', 'zh-Hans': '查看者',
    },
    description: {
      en: 'Only looks at the library.',
      uk: 'Лише переглядає бібліотеку.',
      ru: 'Только просматривает библиотеку.',
      de: 'Sieht sich die Bibliothek nur an.',
      fr: 'Consulte seulement la photothèque.',
      es: 'Solo mira la biblioteca.',
      'pt-BR': 'Apenas vê a biblioteca.',
      ar: 'يعرض المكتبة فقط.',
      id: 'Hanya melihat pustaka.',
      ja: 'ライブラリを見るだけです。',
      'zh-Hans': '仅查看图库。',
    },
  },
};

/** Every permission with its label and description in `lang`. */
export function permissionInfos(lang = 'en'): PermissionInfo[] {
  return PERMISSIONS.map((id) => ({
    id,
    label: localize(PERMISSION_TEXTS[id].label, lang),
    description: localize(PERMISSION_TEXTS[id].description, lang),
  }));
}

export function builtInRoleText(id: BuiltInRoleId, lang = 'en'): { name: string; description: string } {
  const text = ROLE_TEXTS[id];
  return { name: localize(text.name, lang), description: localize(text.description, lang) };
}
