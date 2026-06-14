import PageHeader from "../_components/PageHeader";

export default function ProgramPage() {
  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8 pt-[calc(3.5rem+env(safe-area-inset-top))] lg:pt-8 max-w-[1100px]">
      <PageHeader title="Program" subtitle="Partners, teens, outcomes." />
    </div>
  );
}
