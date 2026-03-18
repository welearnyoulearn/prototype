import Link from "next/link";

interface NavbarProps {
  role: string;
  color: string;
}

export default function Navbar({ role, color }: NavbarProps) {
  return (
    <nav className={`${color} text-white px-6 py-4 flex items-center justify-between shadow-md`}>
      <div className="flex items-center gap-3">
        <Link href="/" className="text-white/70 hover:text-white text-sm">
          ← Home
        </Link>
        <span className="text-white/40">|</span>
        <span className="font-bold text-lg">VLearnUlearn</span>
      </div>
      <div className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
        {role}
      </div>
    </nav>
  );
}
