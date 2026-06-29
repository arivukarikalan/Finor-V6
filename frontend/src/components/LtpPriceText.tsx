import React, { useEffect, useState, useRef } from 'react';

interface LtpPriceTextProps {
  value: number;
}

export const LtpPriceText: React.FC<LtpPriceTextProps> = ({ value }) => {
  const [animationClass, setAnimationClass] = useState('');
  const prevValue = useRef(value);

  useEffect(() => {
    if (value !== prevValue.current) {
      const isUp = value > prevValue.current;
      setAnimationClass(isUp ? 'animate-price-up text-emerald-400 font-extrabold' : 'animate-price-down text-rose-400 font-extrabold');
      prevValue.current = value;
      
      const timer = setTimeout(() => {
        setAnimationClass('');
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [value]);

  return (
    <span className={`transition-all duration-300 ${animationClass || 'text-white'}`}>
      ₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
};
