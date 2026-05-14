"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface Props {
  excluirIntercompany: boolean;
}

export function IntercompanyToggle({ excluirIntercompany }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("excluirIntercompany", String(!excluirIntercompany));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
        excluirIntercompany
          ? "bg-purple-100 border-purple-200 text-purple-700"
          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
      title="Excluir transacciones entre empresas del grupo del consolidado"
    >
      <span className="w-2 h-2 rounded-full bg-purple-400" />
      {excluirIntercompany ? "Intercompany excluido" : "Incluir intercompany"}
    </button>
  );
}
