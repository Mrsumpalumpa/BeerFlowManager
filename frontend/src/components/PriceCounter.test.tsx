import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useState, useEffect } from 'react';
import PriceCounter from './PriceCounter';

// Mock de framer-motion utilizando hooks de React para propagar cambios de forma inmediata
vi.mock('framer-motion', () => {
  return {
    motion: {
      div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    useSpring: (initialValue: number) => {
      const [val, setVal] = useState(initialValue);
      
      const mockSpring = {
        _listeners: new Set<(v: number) => void>(),
        set: (newVal: number) => {
          setVal(newVal);
          mockSpring._listeners.forEach(l => l(newVal));
        },
        get: () => val,
        onChange: (cb: (v: number) => void) => {
          mockSpring._listeners.add(cb);
          return () => mockSpring._listeners.delete(cb);
        },
        on: (event: string, cb: (v: number) => void) => {
          if (event === "change") {
            mockSpring._listeners.add(cb);
            return () => mockSpring._listeners.delete(cb);
          }
          return () => {};
        }
      };
      
      return mockSpring;
    },
    useTransform: (spring: any, transformer: any) => {
      const [transformed, setTransformed] = useState(() => transformer(spring.get()));
      
      useEffect(() => {
        const cb = (v: number) => {
          setTransformed(transformer(v));
        };
        const unsubscribe = spring.onChange ? spring.onChange(cb) : spring.on("change", cb);
        return unsubscribe;
      }, [spring, transformer]);
      
      return transformed;
    },
  };
});

describe('Componente PriceCounter', () => {
  it('se renderiza correctamente con el precio inicial en cero', () => {
    render(<PriceCounter value={0} />);
    expect(screen.getByText('€0.00')).toBeInTheDocument();
  });

  it('formatea correctamente valores decimales a euros', () => {
    render(<PriceCounter value={5.5} />);
    expect(screen.getByText('€5.50')).toBeInTheDocument();
  });

  it('redondea correctamente a 2 decimales', () => {
    render(<PriceCounter value={3.14159} />);
    expect(screen.getByText('€3.14')).toBeInTheDocument();
  });
});
