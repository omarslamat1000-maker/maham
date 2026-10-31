import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="الصفحة غير موجودة"
      description="الرابط غير صحيح أو أن الصفحة نُقلت."
      action={
        <Button asChild>
          <Link to="/">العودة للرئيسية</Link>
        </Button>
      }
    />
  );
}
