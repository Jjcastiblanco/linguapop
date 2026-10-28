import { Navigate, Outlet, type RouteObject } from 'react-router';
import { LearnScreen } from './screens/learn/LearnScreen';
import { CallScreen } from './screens/call/CallScreen';
import { LeaguesScreen } from './screens/leagues/LeaguesScreen';
import { ProfileScreen } from './screens/profile/ProfileScreen';
import { LessonScreen } from './screens/lesson/LessonScreen';
import { PracticeScreen } from './screens/practice/PracticeScreen';
import { PracticeSessionScreen } from './screens/practice/PracticeSessionScreen';
import { AppShell } from './shell/AppShell';
import { Toaster } from './ui/Toaster';

/**
 * Rutas de la app. Atrás cierra una pantalla sin salir de la app. La lección y la llamada ocupan
 * toda la pantalla (sin barras), por eso van fuera del marco; sus historias reemplazan los marcadores.
 */
const screens: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/aprender" replace /> },
      { path: 'aprender', element: <LearnScreen /> },
      { path: 'practicar', element: <PracticeScreen /> },
      { path: 'ligas', element: <LeaguesScreen /> },
      { path: 'perfil', element: <ProfileScreen /> },
    ],
  },
  { path: '/practicar/sesion', element: <PracticeSessionScreen /> },
  { path: '/leccion/:unitId/:lessonId', element: <LessonScreen /> },
  { path: '/llamada', element: <CallScreen /> },
  { path: '*', element: <Navigate to="/aprender" replace /> },
];

/** Raíz de todas las rutas: las pantallas y, encima de ellas, los avisos breves. */
function Root() {
  return (
    <>
      <Outlet />
      <Toaster />
    </>
  );
}

export const appRoutes: RouteObject[] = [{ element: <Root />, children: screens }];
