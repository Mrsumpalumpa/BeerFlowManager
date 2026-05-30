import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';

export default function PriceCounter({ value }: { value: number }) {
  const springValue = useSpring(0, { bounce: 0, duration: 800 });
  
  const displayValue = useTransform(springValue, (current) => `€${current.toFixed(2)}`);

  useEffect(() => {
    springValue.set(value);
  }, [value, springValue]);

  return (
    <motion.div 
      className="text-6xl sm:text-7xl font-black text-amber-400 tracking-tight tabular-nums drop-shadow-[0_2px_12px_rgba(251,191,36,0.3)]"
    >
      {displayValue}
    </motion.div>
  );
}
