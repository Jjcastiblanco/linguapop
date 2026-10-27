import { Navigate, type RouteObject } from 'react-router';
import { Placeholder } from './screens/Placeholder';
import { AppShell } from './shell/AppShell';

/** Rutas de la app. Atrás cierra una pantalla sin salir de la app (las lecciones y llamadas llegan con sus historias). */
export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/aprender" replace /> },
      { path: 'aprender', element: <Placeholder title="screen.learn.title" /> },
      { path: 'practicar', element: <Placeholder title="screen.practice.title" /> },
      { path: 'ligas', element: <Placeholder title="screen.leagues.title" /> },
      { path: 'perfil', element: <Placeholder title="screen.profile.title" /> },
      { path: '*', element: <Navigate to="/aprender" replace /> },
    ],
  },
];
