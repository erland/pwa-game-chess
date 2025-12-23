import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
  }
>;

export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  const cn = ['btn', `btn-${variant}`, className].filter(Boolean).join(' ');
  return <button {...props} className={cn} />;
}
