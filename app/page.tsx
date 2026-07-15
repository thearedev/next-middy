"use client";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <button onClick={callSuccessApi} className="text-black dark:text-white py-2 px-4 bg-gray-200 dark:bg-gray-700 rounded cursor-pointer">Call Success API</button>
        <button onClick={callFailContentTypeApi} className="text-black dark:text-white py-2 px-4 bg-gray-200 dark:bg-gray-700 rounded cursor-pointer">Call Fail Content-Type API</button>
        <button onClick={callFailXAppNameApi} className="text-black dark:text-white py-2 px-4 bg-gray-200 dark:bg-gray-700 rounded cursor-pointer">Call Fail X-App-Name API</button>
      </main>
    </div>
  );
}

const callSuccessApi = async () => {
  const response = await fetch("http://localhost:3000/api/secure-endpoint", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-app-name": "My-App",
    },
    body: JSON.stringify({ message: "Hello from frontend!" }),
  });

  const data = await response.json();
  console.log(data);
};

const callFailContentTypeApi = async () => {
  const response = await fetch("http://localhost:3000/api/secure-endpoint", {
    method: "POST",
    headers: {
      "Content-Type": "application/xml",
      "x-app-name": "My-App",
    },
    body: JSON.stringify({ message: "Hello from frontend!" }),
  });

  const data = await response.json();
  console.log(data);
};


const callFailXAppNameApi = async () => {
  const response = await fetch("http://localhost:3000/api/secure-endpoint", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-app-name": "",
    },
    body: JSON.stringify({ message: "Hello from frontend!" }),
  });

  const data = await response.json();
  console.log(data);
};