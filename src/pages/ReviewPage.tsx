import { useParams } from 'react-router-dom';

import { ReviewPageView } from './review/ReviewPageView';
import { useReviewController } from './review/useReviewController';

export function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const c = useReviewController(id);
  return <ReviewPageView c={c} />;
}
