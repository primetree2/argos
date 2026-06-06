export default function AuthError() {
    return (
        <div className="flex min-h-screen items-center justify-center">
            <div className="text-center">
                <h1 className="text-2xl font-bold text-red-500">Authentication Error</h1>
                <p className="mt-2 text-gray-400">Something went wrong. Please try again.</p>
                <a href="/login" className="mt-4 inline-block text-blue-400 underline">
                    Back to login
                </a>
            </div>
        </div>
    );
}