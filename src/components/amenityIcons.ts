import { BookOpen, Car, Check, Droplets, ShieldCheck, Shirt, Store, Wifi, Zap, type LucideIcon } from 'lucide-react';

export const AMEN_ICON: Record<string, LucideIcon> = { wifi: Wifi, security: ShieldCheck, laundry: Shirt, water: Droplets, study: BookOpen, shop: Store, power: Zap, parking: Car };
export const amenIcon = (k: string) => AMEN_ICON[k] ?? Check;
