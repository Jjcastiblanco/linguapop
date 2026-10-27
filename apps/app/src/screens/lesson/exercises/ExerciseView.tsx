import type { Exercise } from '@linguapop/content';
import { ListenExercise } from './ListenExercise';
import { MatchExercise } from './MatchExercise';
import { McExercise } from './McExercise';
import { OrderExercise } from './OrderExercise';
import { SpeakExercise } from './SpeakExercise';
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
    case 'match':
      return <MatchExercise exercise={exercise} {...rest} />;
    case 'listen':
      return <ListenExercise exercise={exercise} {...rest} />;
    case 'speak':
      return <SpeakExercise exercise={exercise} {...rest} />;
  }
}
