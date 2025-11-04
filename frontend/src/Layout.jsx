import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { Dialog, DialogBackdrop, DialogPanel, TransitionChild } from "@headlessui/react";
import {
    Bars3Icon,
    CalendarIcon,
    ChartPieIcon,
    DocumentDuplicateIcon,
    FolderIcon,
    HomeIcon,
    UsersIcon,
    XMarkIcon,
    AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import logo from "./assets/logo-white.png";
import { useLocation } from "react-router-dom";

const navigationOnline = [
    { name: "Drivers and Monoposts", href: "/data-input", icon: AdjustmentsHorizontalIcon, current: true },
    { name: "Dashboard", href: "/live-dashboard", icon: HomeIcon, current: false },
    { name: "Advance Charts", href: "/live-advance-charts", icon: UsersIcon, current: false },
    // { name: "Longer charts", href: "/longer-charts", icon: UsersIcon, current: false },
];
const navigationOffline = [
    { name: "Drivers and Monoposts", href: "/data-input", icon: AdjustmentsHorizontalIcon, current: true },
    { name: "Advance Charts", href: "/offline-advance-charts", icon: UsersIcon, current: false },
    // { name: "Longer charts", href: "/longer-charts", icon: UsersIcon, current: false },
];
function classNames(...classes) {
    return classes.filter(Boolean).join(" ");
}

export default function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();

    const navigation = navigationOnline.map((item) => ({
        ...item,
        current: location.pathname.includes(item.href),
    }));
    return (
        <>
            <div>
                <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 lg:hidden">
                    <DialogBackdrop
                        transition
                        className="fixed inset-0 bg-gray-900/80 transition-opacity duration-300 ease-linear data-[closed]:opacity-0"
                    />

                    <div className="fixed inset-0 flex">
                        <DialogPanel
                            transition
                            className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-[closed]:-translate-x-full"
                        >
                            <TransitionChild>
                                <div className="absolute left-full top-0 flex w-16 justify-center pt-5 duration-300 ease-in-out data-[closed]:opacity-0">
                                    <button
                                        type="button"
                                        onClick={() => setSidebarOpen(false)}
                                        className="-m-2.5 p-2.5"
                                    >
                                        <span className="sr-only">Close sidebar</span>
                                        <XMarkIcon aria-hidden="true" className="size-6 text-white" />
                                    </button>
                                </div>
                            </TransitionChild>
                            {/* Sidebar component, swap this element with another sidebar if you like */}
                            <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-red-700 px-6 pb-2">
                                <div className="flex h-16 shrink-0 items-center">
                                    <img alt="Your Company" src={logo} className="h-8 w-auto" />
                                </div>
                                <nav className="flex flex-1 flex-col">
                                    <ul role="list" className="flex flex-1 flex-col gap-y-7">
                                        <li>
                                            <ul role="list" className="-mx-2 space-y-1">
                                                {navigation.map((item) => (
                                                    <li key={item.name}>
                                                        <Link
                                                            to={item.href}
                                                            className={classNames(
                                                                item.current
                                                                    ? "bg-red-800 text-white"
                                                                    : "text-red-200 hover:bg-red-800 hover:text-white",
                                                                "group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold"
                                                            )}
                                                        >
                                                            <item.icon
                                                                aria-hidden="true"
                                                                className={classNames(
                                                                    item.current
                                                                        ? "text-white"
                                                                        : "text-red-200 group-hover:text-white",
                                                                    "size-6 shrink-0"
                                                                )}
                                                            />
                                                            {item.name}
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        </li>
                                    </ul>
                                </nav>
                            </div>
                        </DialogPanel>
                    </div>
                </Dialog>

                {/* Static sidebar for desktop */}
                <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
                    {/* Sidebar component, swap this element with another sidebar if you like */}
                    <div className="flex grow flex-col gap-y-5 overflow-y-auto bg-red-700 px-6">
                        <div className="flex h-16 shrink-0 items-center">
                            <img alt="Your Company" src={logo} className="h-8 w-auto" />
                        </div>
                        <nav className="flex flex-1 flex-col">
                            <ul role="list" className="flex flex-1 flex-col gap-y-7">
                                <li>
                                    <ul role="list" className="-mx-2 space-y-1">
                                        {navigation.map((item) => (
                                            <li key={item.name}>
                                                <Link
                                                    to={item.href}
                                                    className={classNames(
                                                        item.current
                                                            ? "bg-red-800 text-white"
                                                            : "text-red-200 hover:bg-red-800 hover:text-white",
                                                        "group flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold"
                                                    )}
                                                >
                                                    <item.icon
                                                        aria-hidden="true"
                                                        className={classNames(
                                                            item.current
                                                                ? "text-white"
                                                                : "text-red-200 group-hover:text-white",
                                                            "size-6 shrink-0"
                                                        )}
                                                    />
                                                    {item.name}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </li>
                            </ul>
                        </nav>
                    </div>
                </div>

                <div className="sticky top-0 z-40 flex items-center gap-x-6 bg-red-700 px-4 py-4 shadow-sm sm:px-6 lg:hidden">
                    <button
                        type="button"
                        onClick={() => setSidebarOpen(true)}
                        className="-m-2.5 p-2.5 text-red-200 lg:hidden"
                    >
                        <span className="sr-only">Open sidebar</span>
                        <Bars3Icon aria-hidden="true" className="size-6" />
                    </button>
                    <div className="flex-1 text-sm/6 font-semibold text-white">Dashboard</div>
                    <a href="#">
                        <span className="sr-only">Your profile</span>
                        <img
                            alt=""
                            src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                            className="size-8 rounded-full bg-red-800"
                        />
                    </a>
                </div>

                <main className="py-10 lg:pl-72">
                    <div className="px-4 sm:px-6 lg:px-8">
                        <Outlet />
                    </div>
                </main>
            </div>
        </>
    );
}
