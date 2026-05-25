"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SupportedCurrency, CurrencyFormatOptions } from "./formatters";
import {
  currency as fmtCurrency,
  currencyCompact as fmtCurrencyCompact,
  signedCurrency as fmtSignedCurrency,
  signedCurrencyCompact as fmtSignedCurrencyCompact,
} from "./formatters";

/**
 * Contexto global de moneda activa para el dashboard.
 *
 * Mantiene la moneda elegida por el usuario (USD por defecto) y la tasa
 * de cambio desde USD. Los componentes consumen el hook useCurrency()
 * para obtener funciones ya bindeadas a la moneda activa.
 *
 * Persistencia: localStorage. Si el usuario cambia, queda guardado entre
 * sesiones.
 */

type CurrencyContextValue = {
  activeCurrency: SupportedCurrency;
  setActiveCurrency: (c: SupportedCurrency) => void;
  fxRateUsdToEur: number;
  /** Helper: obtén el objeto opts ya listo para pasar a los formatters. */
  formatterOpts: CurrencyFormatOptions;
};

const CurrencyContext = createContext<CurrencyContextValue>({
  activeCurrency: "USD",
  setActiveCurrency: () => {},
  fxRateUsdToEur: 1,
  formatterOpts: { currency: "USD", rate: 1 },
});

const STORAGE_KEY = "portfolio.activeCurrency";

export function CurrencyProvider({
  children,
  fxRateUsdToEur,
}: {
  children: React.ReactNode;
  fxRateUsdToEur: number;
}) {
  const [activeCurrency, setActiveCurrencyState] = useState<SupportedCurrency>("USD");

  // Hidratación desde localStorage tras montar (evita mismatch SSR)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "EUR" || saved === "USD") {
        setActiveCurrencyState(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const setActiveCurrency = useCallback((c: SupportedCurrency) => {
    setActiveCurrencyState(c);
    try {
      window.localStorage.setItem(STORAGE_KEY, c);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<CurrencyContextValue>(() => {
    const rate = activeCurrency === "EUR" ? fxRateUsdToEur : 1;
    return {
      activeCurrency,
      setActiveCurrency,
      fxRateUsdToEur,
      formatterOpts: { currency: activeCurrency, rate },
    };
  }, [activeCurrency, fxRateUsdToEur, setActiveCurrency]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  return useContext(CurrencyContext);
}

/**
 * Hook con los formatters ya pre-bindeados a la moneda activa.
 * Uso: const { fmtMoney } = useMoneyFormatters(); fmtMoney(123.45)
 */
export function useMoneyFormatters() {
  const { formatterOpts } = useCurrency();
  return useMemo(() => ({
    fmtMoney: (usd: number) => fmtCurrency(usd, formatterOpts),
    fmtMoneySigned: (usd: number) => fmtSignedCurrency(usd, formatterOpts),
    fmtMoneyCompact: (usd: number) => fmtCurrencyCompact(usd, formatterOpts),
    fmtMoneySignedCompact: (usd: number) => fmtSignedCurrencyCompact(usd, formatterOpts),
  }), [formatterOpts]);
}
