import { Navigate, type RouteObject } from 'react-router';
import { Placeholder } from './screens/Placeholder';
import { LearnScreen } from './screens/learn/LearnScreen';
import { LessonScreen } from './screens/lesson/LessonScreen';
import { AppShell } from './shell/AppShell';

/**
 * Rutas de la app. Atrás cierra una pantalla sin salir de la app. La lección y la llamada ocupan
 * toda la pantalla (sin barras), por eso van fuera del marco; sus historias reemplazan los marcadores.
 */
export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/aprender" replace /> },
      { path: 'aprender', element: <LearnScreen /> },
      { path: 'practicar', element: <Placeholder title="screen.practice.title" /> },
      { path: 'ligas', element: <Placeholder title="screen.leagues.title" /> },
      { path: 'perfil', element: <Placeholder title="screen.profile.title" /> },
    ],
  },
  { path: '/leccion/:unitId/:lessonId', element: <LessonScreen /> },
  { path: '/llamada', element: <Placeholder title="screen.call.title" /> },
  { path: '*', element: <Navigate to="/aprender" replace /> },
];
