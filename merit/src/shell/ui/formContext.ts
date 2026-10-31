"use client";

import { createContext } from "react";
import type { FieldErrors } from "@/lib/result";

/** Field errors of the surrounding FormDialog (empty outside one); `Field` reads its own entry. */
export const FieldErrorsContext = createContext<FieldErrors>({});
