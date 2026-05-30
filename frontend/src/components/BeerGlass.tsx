import { motion } from 'framer-motion';

interface BeerGlassProps {
  mlTotal: number;
  maxCapacity?: number; // 500ml by default (a standard pint)
}

export default function BeerGlass({ mlTotal, maxCapacity = 500 }: BeerGlassProps) {
  const percentage = Math.min(100, Math.max(0, (mlTotal / maxCapacity) * 100));

  return (
    <div className="w-[180px] h-[350px] relative mx-auto">
      {/* Vaso SVG outline */}
      <svg
        viewBox="0 0 100 200"
        className="w-full h-full absolute top-0 left-0 z-10 fill-none stroke-white/60 stroke-[4px] stroke-linejoin-round"
      >
        <path d="M 15 5 L 25 185 A 10 10 0 0 0 35 195 L 65 195 A 10 10 0 0 0 75 185 L 85 5" />
      </svg>

      {/* Liquido (Cerveza) mask */}
      <div 
        className="absolute top-[12px] bottom-[15px] left-[20px] right-[20px] overflow-hidden rounded-b-[10px] flex items-end shadow-[inset_0_0_15px_rgba(0,0,0,0.5)] bg-white/[0.03]"
        style={{
          clipPath: 'polygon(0% 0%, 100% 0%, 82% 100%, 18% 100%)',
        }}
      >
        <motion.div
          initial={{ height: '0%' }}
          animate={{ height: `${percentage}%` }}
          transition={{ type: 'tween', ease: 'easeOut', duration: 0.3 }}
          className="w-full bg-gradient-to-t from-amber-600 to-amber-400 relative"
        >
          {/* Burbujas animadas simples */}
          <div 
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)',
              backgroundSize: '10px 10px',
            }}
          />

          {/* Espuma simulada si hay cerveza */}
          {percentage > 2 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="h-[15px] w-full bg-yellow-100 absolute top-0 rounded-[2px] shadow-[0_-2px_5px_rgba(255,255,255,0.5)]"
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}
