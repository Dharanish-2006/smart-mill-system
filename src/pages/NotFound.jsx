import { Link } from 'react-router-dom';
import { Card, Empty } from '../components/ui.jsx';

export default function NotFound() {
  return (
    <Card>
      <Empty title="Page not found">
        <Link to="/" className="text-sky-700 underline">Back to the dashboard</Link>
      </Empty>
    </Card>
  );
}
