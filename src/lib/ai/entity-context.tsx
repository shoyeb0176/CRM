import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AiEntity = {
  type: "company" | "contact" | "deal" | "invoice" | "project" | "product";
  id: string;
  label: string;
};

type Ctx = {
  entity: AiEntity | null;
  setEntity: (e: AiEntity | null) => void;
};

const AiEntityContext = createContext<Ctx>({ entity: null, setEntity: () => {} });

export function AiEntityProvider({ children }: { children: ReactNode }) {
  const [entity, setEntity] = useState<AiEntity | null>(null);
  const value = useMemo(() => ({ entity, setEntity }), [entity]);
  return <AiEntityContext.Provider value={value}>{children}</AiEntityContext.Provider>;
}

export function useAiEntityContext() {
  return useContext(AiEntityContext);
}

/** Registers the record the user is currently looking at, so the assistant can
 *  answer questions about it without being told which record it is. */
export function useAiEntity(entity: AiEntity | null) {
  const { setEntity } = useAiEntityContext();
  const key = entity ? `${entity.type}:${entity.id}:${entity.label}` : null;
  useEffect(() => {
    setEntity(entity);
    return () => setEntity(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
