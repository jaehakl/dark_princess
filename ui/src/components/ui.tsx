import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

type ButtonVariant = 'default' | 'primary' | 'danger';

const buttonBase =
  'rounded-[8px] border font-extrabold transition-[transform,filter,border-color,background] ' +
  'disabled:cursor-not-allowed hover:enabled:-translate-y-px';

const buttonVariants: Record<ButtonVariant, string> = {
  default:
    'border-[rgba(255,216,176,0.54)] bg-[linear-gradient(135deg,rgba(255,231,180,0.24),rgba(232,90,135,0.16)),rgba(38,12,40,0.82)] ' +
    'text-[#fff5eb] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_rgba(10,0,18,0.3)] ' +
    '[text-shadow:0_1px_8px_rgba(0,0,0,0.5)] hover:enabled:border-[rgba(255,238,205,0.92)] hover:enabled:brightness-[1.06] ' +
    'disabled:border-[rgba(188,144,158,0.28)] disabled:bg-[rgba(68,48,66,0.42)] disabled:text-[rgba(245,221,228,0.46)] disabled:shadow-none',
  primary:
    'border-[rgba(255,226,176,0.82)] bg-[linear-gradient(135deg,#f4bf67,#e45f8a_54%,#6f2c67),rgba(55,12,44,0.95)] ' +
    'text-[#fff5eb] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_rgba(10,0,18,0.3)] ' +
    '[text-shadow:0_1px_8px_rgba(0,0,0,0.5)] hover:enabled:border-[rgba(255,238,205,0.92)] hover:enabled:brightness-[1.06] ' +
    'disabled:border-[rgba(188,144,158,0.28)] disabled:bg-[rgba(68,48,66,0.42)] disabled:text-[rgba(245,221,228,0.46)] disabled:shadow-none',
  danger:
    'border-[rgba(255,133,165,0.46)] bg-[rgba(96,18,46,0.5)] text-[#ffc2d1] ' +
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] hover:enabled:border-[rgba(255,171,190,0.9)] hover:enabled:bg-[rgba(144,28,66,0.62)] disabled:opacity-55',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({
  className,
  variant = 'default',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(buttonBase, buttonVariants[variant], className)}
      {...props}
    />
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cx(
        'relative overflow-hidden rounded-[8px] border border-[var(--app-border)] ' +
          'bg-[linear-gradient(145deg,rgba(255,224,235,0.13),transparent_32%),linear-gradient(180deg,rgba(36,12,44,0.88),rgba(19,8,26,0.78))] ' +
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.16),var(--app-shadow)] backdrop-blur-[22px] ' +
          'before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] ' +
          "before:bg-[radial-gradient(circle_at_0%_0%,rgba(255,192,214,0.2),transparent_28%),radial-gradient(circle_at_100%_0%,rgba(255,224,170,0.16),transparent_30%)] before:content-['']",
        className,
      )}
      {...props}
    />
  );
}

export function PanelHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'relative flex items-center justify-between gap-3 border-b border-[rgba(255,196,214,0.24)] px-[1.1rem] py-4',
        className,
      )}
      {...props}
    />
  );
}

export function SectionBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('relative p-4', className)} {...props} />;
}

type ModalBackdropProps = HTMLAttributes<HTMLDivElement> & {
  nested?: boolean;
  topAligned?: boolean;
  blurred?: boolean;
};

export function ModalBackdrop({
  className,
  nested = false,
  topAligned,
  blurred = true,
  ...props
}: ModalBackdropProps) {
  const shouldTopAlign = topAligned ?? nested;

  const backdrop = (
    <div
      className={cx(
        'fixed inset-0 grid max-h-[100dvh] min-h-[100dvh] overflow-y-auto overscroll-contain px-4 py-6',
        shouldTopAlign ? 'items-start justify-items-center' : 'place-items-center',
        blurred && 'backdrop-blur-[10px]',
        nested ? 'z-[70] bg-[rgba(5,0,10,0.62)]' : 'z-50 bg-[rgba(5,0,10,0.72)]',
        className,
      )}
      {...props}
    />
  );

  return createPortal(backdrop, document.body);
}

type FieldLabelProps = LabelHTMLAttributes<HTMLLabelElement> & {
  required?: boolean;
};

export function FieldLabel({ className, required = false, ...props }: FieldLabelProps) {
  return (
    <label
      className={cx(
        'inline-flex min-w-0 max-w-full items-center gap-1 text-xs font-extrabold uppercase tracking-[0.08em] text-[#f1c4d0]',
        required && "after:shrink-0 after:text-[#ff8fb2] after:content-['*']",
        className,
      )}
      {...props}
    />
  );
}

type ControlProps =
  | ({ as?: 'input' } & InputHTMLAttributes<HTMLInputElement>)
  | ({ as: 'textarea' } & TextareaHTMLAttributes<HTMLTextAreaElement>)
  | ({ as: 'select' } & SelectHTMLAttributes<HTMLSelectElement>);

const controlClass =
  'rounded-[8px] border border-[rgba(255,196,214,0.34)] bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.035)),rgba(13,5,19,0.72)] ' +
  'text-[0.95rem] text-[var(--app-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_12px_24px_rgba(0,0,0,0.18)] ' +
  'transition-[border-color,box-shadow,background] placeholder:text-[rgba(244,208,218,0.55)] ' +
  'focus:border-[rgba(255,226,186,0.95)] focus:bg-[rgba(16,6,22,0.92)] focus:shadow-[0_0_0_4px_rgba(240,179,95,0.12),0_18px_36px_rgba(0,0,0,0.22)]';

export function FormControl(props: ControlProps) {
  if (props.as === 'textarea') {
    const { as: _as, className, ...textareaProps } = props;
    return <textarea className={cx(controlClass, className)} {...textareaProps} />;
  }

  if (props.as === 'select') {
    const { as: _as, className, ...selectProps } = props;
    return <select className={cx(controlClass, className)} {...selectProps} />;
  }

  const { as: _as, className, ...inputProps } = props;
  return <input className={cx(controlClass, className)} {...inputProps} />;
}

export function Spinner({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx(
        'h-4 w-4 rounded-full border-2 border-[rgba(255,245,232,0.35)] border-t-[#fff7ef] animate-spin',
        className,
      )}
      {...props}
    />
  );
}

export function ImageFrame({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'grid aspect-[1216/832] place-items-center overflow-hidden bg-[rgba(16,7,22,0.76)]',
        className,
      )}
      {...props}
    />
  );
}
