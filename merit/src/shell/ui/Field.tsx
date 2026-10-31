"use client";

import { cloneElement, isValidElement, type ReactElement, type ReactNode, useContext, useId } from "react";
import { FieldErrorsContext } from "./formContext";

type Props = {
  /** Form field name: the key in the submitted values and in the server's `fieldErrors`. */
  name: string;
  label: string;
  /** Overrides the error taken from the surrounding FormDialog. */
  error?: string;
  children: ReactNode;
};

type ControlProps = { id?: string; name?: string; "aria-invalid"?: boolean; "aria-describedby"?: string };

/**
 * One labelled form control. A single element child (input, select, textarea) receives the
 * generated id, its `name` and the error wiring (aria-invalid / aria-describedby); the error text
 * shows below the control.
 */
export function Field({ name, label, error, children }: Props) {
  const id = useId();
  const errors = useContext(FieldErrorsContext);
  const message = error ?? errors[name]?.[0];
  const errorId = `${id}-error`;

  const control = isValidElement<ControlProps>(children)
    ? cloneElement(children as ReactElement<ControlProps>, {
        id,
        name,
        ...(message ? { "aria-invalid": true, "aria-describedby": errorId } : {}),
      })
    : children;

  return (
    <div className="xp-field">
      <label className="xp-field-label" htmlFor={id}>
        {label}
      </label>
      {control}
      {message ? (
        <p id={errorId} className="xp-field-error">
          {message}
        </p>
      ) : null}
    </div>
  );
}
