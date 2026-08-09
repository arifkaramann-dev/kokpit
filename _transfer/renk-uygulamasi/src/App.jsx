import { Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout.jsx';
import Home from '@/pages/Home.jsx';
import Scan from '@/pages/Scan.jsx';
import Create from '@/pages/Create.jsx';
import AiStudio from '@/pages/AiStudio.jsx';
import Templates from '@/pages/Templates.jsx';
import Packaging from '@/pages/Packaging.jsx';
import Library from '@/pages/Library.jsx';
import PaintDetail from '@/pages/PaintDetail.jsx';
import StlPaint from '@/pages/StlPaint.jsx';
import PhotoPaint from '@/pages/PhotoPaint.jsx';
import NotFound from '@/pages/NotFound.jsx';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tara" element={<Scan />} />
        <Route path="/sablonlar" element={<Templates />} />
        <Route path="/ambalajlar" element={<Packaging />} />
        <Route path="/ai" element={<AiStudio />} />
        <Route path="/uret" element={<Create />} />
        <Route path="/kutuphane" element={<Library />} />
        <Route path="/boya/:id" element={<PaintDetail />} />
        <Route path="/stl" element={<StlPaint />} />
        <Route path="/fotograf" element={<PhotoPaint />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}
