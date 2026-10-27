import type { Exercise } from '@linguapop/content';
import { McExercise } from './McExercise';
import { OrderExercise } from './OrderExercise';
import { Unsupported } from './Unsupported';
import { WriteExercise } from './WriteExercise';
import type { ExerciseProps } from './types';

type Props = Omit<ExerciseProps<Exercise>, 'exercise'> & { exercise: Exercise };

/** Elige la pantalla según el tipo de ejercicio. */
export function ExerciseView({ exercise, ...rest }: Props) {
  switch (exercise.type) {
    case 'mc':
      return <McExercise exercise={exercise} {...rest} />;
    case 'order':
      return <OrderExercise exercise={exercise} {...rest} />;
    case 'write':
      return <WriteExercise exercise={exercise} {...rest} />;
    default:
      return <Unsupported />;
  }
}
