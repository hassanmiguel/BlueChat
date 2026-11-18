import type { CSSProperties } from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  className?: string;
  style?: CSSProperties;
}

export default function Avatar({ src, name, className = '', style }: AvatarProps) {
  if (src && /\.(mp4|webm)(\?|$)/i.test(src)) {
    return <video src={src} autoPlay loop muted playsInline className={`object-cover ${className}`} style={style} />;
  }
  if (src) {
    return <img src={src} alt="" className={`object-cover ${className}`} style={style} />;
  }
  return (
    <div className={`flex items-center justify-center ${className}`} style={style}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  );
}
