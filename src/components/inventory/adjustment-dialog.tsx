import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useOrgId } from "@/lib/crm/use-org";
import { useWarehouses } from "@/lib/inventory/use-inv";

const REASONS = ["Stock count", "Damage / loss", "Receipt", "Manual correction", "Return", "Other"];

export function AdjustmentDialog({
  open, onOpenChange, productId, defaultWarehouseId, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId?: string;
  defaultWarehouseId?: string;
  onDone?: () => void;
}) {
  const orgId = useOrgId();
  const warehouses = useWarehouses();
  const [selectedProduct, setSelectedProduct] = useState<string>(productId ?? "");
  const [warehouseId, setWarehouseId] = useState<string>(defaultWarehouseId ?? "");
  const [delta, setDelta] = useState<string>("");
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedProduct(productId ?? "");
    setWarehouseId(defaultWarehouseId ?? warehouses.data?.[0]?.id ?? "");
    setDelta("");
    setReason(REASONS[0]);
    setNotes("");
    setErrorMsg(null);
  }, [open, productId, defaultWarehouseId, warehouses.data]);

  const products = useQuery({
    queryKey: ["products-min", orgId],
    enabled: !!orgId && !productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products").select("id, name, sku").eq("org_id", orgId!)
        .eq("archived", false).eq("track_inventory", true).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      setErrorMsg(null);
      const n = Number(delta);
      if (!selectedProduct) throw new Error("Pick a product");
      if (!warehouseId) throw new Error("Pick a warehouse");
      if (!n || Number.isNaN(n)) throw new Error("Enter a non-zero quantity (+ or −)");
      const params = {
        _org: orgId!,
        _warehouse: warehouseId,
        _product: selectedProduct,
        _variant: null as unknown as string,
        _delta: n,
        _reason: reason,
        _notes: (notes || "") as string,
      };
      const { error } = await supabase.rpc("apply_inventory_adjustment", params);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock adjusted");
      onDone?.();
      onOpenChange(false);
    },
    onError: (e: Error) => { setErrorMsg(e.message); toast.error(e.message); },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>Use a positive number to add stock, negative to remove.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!productId && (
            <div>
              <Label>Product</Label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                <SelectContent>
                  {products.data?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} {p.sku && `· ${p.sku}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Warehouse</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Choose warehouse" /></SelectTrigger>
                <SelectContent>
                  {warehouses.data?.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity change</Label>
              <Input type="number" step="0.01" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="+10 or -3" />
            </div>
          </div>
          <div>
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {errorMsg && (
            <p role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMsg}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Apply adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
