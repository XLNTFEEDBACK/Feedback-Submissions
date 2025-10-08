import SubmissionForm from "../components/SubmissionForm";

export default function SubmitPage() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center">
      <div className="w-full bg-black py-12">
        <h1 className="text-4xl font-bold text-white text-center">
          XLNT FEEDBACK
        </h1>
      </div>
      <div className="w-full flex justify-center">
        <SubmissionForm />
      </div>
    </div>
  );
}
