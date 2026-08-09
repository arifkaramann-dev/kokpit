import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-24 text-center">
      <div className="text-5xl font-semibold text-neutral-900">404</div>
      <p className="mt-3 text-sm text-neutral-500">Sayfa bulunamadı.</p>
      <Link
        to="/"
        className="mt-6 inline-block bg-neutral-900 text-white text-sm px-5 py-2.5 rounded-full hover:bg-neutral-800"
      >
        Genel Bakış'a dön
      </Link>
    </div>
  );
}
