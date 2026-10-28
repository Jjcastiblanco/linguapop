import { Navigate } from 'react-router';
import { useLesson } from '../../composition/context';
import { SessionView } from '../lesson/SessionView';

/**
 * Sesión de práctica: `PracticeScreen` la arma e inicia en el almacén antes de llegar aquí.
 * Sin sesión en curso ni fallo que mostrar (por ejemplo, al recargar), se vuelve a Practicar.
 * La sesión se cierra al terminar o al abrir Practicar, no al desmontar: con `StrictMode` el
 * montaje se repite y cerrarla ahí echaría al estudiante de su propia sesión.
 */
export function PracticeSessionScreen() {
  const active = useLesson(
    (s) => s.failure !== null || (s.lesson !== null && s.lesson.phase !== 'aborted'),
  );
  if (!active) return <Navigate to="/practicar" replace />;
  return <SessionView exitTo="/practicar" />;
}
