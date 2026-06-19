import { useState, useEffect } from 'react';

interface ProgressiveImageProps {
    smallUrl: string | null;
    largeUrl: string | null;
    alt?: string;
    className: string;
}

export default function ProgressiveImage({ smallUrl, largeUrl, alt, className }: ProgressiveImageProps) {
  const small = smallUrl?? "";
  const fullImage = largeUrl ?? small; // если большой нет, оставим маленькую
  
  const [currentSrc, setCurrentSrc] = useState(small);

  useEffect(() => {
    // Создаем виртуальное изображение в памяти для предзагрузки
    const img = new Image();
    img.src = fullImage;
    img.onload = () => {
      setCurrentSrc(fullImage); // Подменяем url, когда картинка скачалась
    };
  }, [fullImage]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentSrc} 
      alt={alt ?? "image"} 
      className={className}
    />
  );
}
