import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BeerGlass from './BeerGlass';

// Mock de framer-motion para mapear propiedades de animacion a estilos en jsdom
vi.mock('framer-motion', () => {
  return {
    motion: {
      div: ({ children, style, animate, initial, ...props }: any) => {
        const combinedStyle = {
          ...style,
          ...(typeof animate === 'object' ? animate : {}),
        };
        return (
          <div style={combinedStyle} {...props}>
            {children}
          </div>
        );
      },
    },
  };
});

describe('Componente BeerGlass', () => {
  it('se renderiza correctamente con 0ml (vacío)', () => {
    const { container } = render(<BeerGlass mlTotal={0} maxCapacity={500} />);
    
    // El vaso SVG debe estar en el DOM
    const svgElement = container.querySelector('svg');
    expect(svgElement).toBeInTheDocument();

    // El líquido de la cerveza debe tener una altura de 0%
    const beerDiv = container.querySelector('.bg-gradient-to-t');
    expect(beerDiv).toHaveStyle('height: 0%');
  });

  it('se renderiza correctamente al 50% de su capacidad', () => {
    const { container } = render(<BeerGlass mlTotal={250} maxCapacity={500} />);
    
    const beerDiv = container.querySelector('.bg-gradient-to-t');
    expect(beerDiv).toHaveStyle('height: 50%');
  });

  it('limita el llenado al 100% si el volumen supera la capacidad máxima', () => {
    const { container } = render(<BeerGlass mlTotal={600} maxCapacity={500} />);
    
    const beerDiv = container.querySelector('.bg-gradient-to-t');
    expect(beerDiv).toHaveStyle('height: 100%');
  });
});
