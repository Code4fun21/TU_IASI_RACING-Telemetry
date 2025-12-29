import { useLocation, useNavigate } from "react-router-dom";
import { EAxisType, EChart2DModifierType, ESeriesType, SciChartSurface } from "scichart";
import { SciChartReact } from "scichart-react";
import { createTable, getData, getTable } from "../api/endpoints";
import { useState } from "react";

SciChartSurface.loadWasmFromCDN();
const stats = [
    { name: "Total Subscribers", stat: "71,897" },
    { name: "Avg. Open Rate", stat: "58.16%" },
    { name: "Avg. Click Rate", stat: "24.57%" },
];

function Dashboard() {
    const fileData = useLocation().state.fileData;
    console.log("files", fileData);
    const [dataX, setDataX] = useState([]);
    const [dataY, setDataY] = useState([]);

    let navigate = useNavigate();

    const onClickReadFile = () => {
        navigate("/from-file");
    };

    const onButtonClick = async () => {
        getTable().then((response) => {
            console.log("Create table", response);
            var dataX = Object.values(response.data.Data.Battery_voltage.Time);
            var dataY = Object.values(response.data.Data.Battery_voltage.data);

            console.log(dataX);
            console.log(dataY);

            setDataX(dataX);
            setDataY(dataY);
        });
    };
    return (
        <>
            <div>
                <button
                    type="button"
                    onClick={onButtonClick}
                    className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                >
                    Button text
                </button>
                <h3 className="text-base font-semibold text-gray-900">Last 30 days</h3>
                <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
                    {stats.map((item) => (
                        <div key={item.name} className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                            <dt className="truncate text-sm font-medium text-gray-500">{item.name}</dt>
                            <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{item.stat}</dd>
                        </div>
                    ))}
                </dl>
                <div>
                    <SciChartReact
                        style={{ width: 800, height: 600 }}
                        config={{
                            xAxes: [{ type: EAxisType.NumericAxis }],
                            yAxes: [{ type: EAxisType.NumericAxis }],
                            series: [
                                {
                                    type: ESeriesType.SplineMountainSeries,
                                    options: {
                                        fill: "#3ca832",
                                        stroke: "#eb911c",
                                        strokeThickness: 4,
                                        opacity: 0.4,
                                    },
                                    xyData: { xValues: dataX, yValues: dataY },
                                },
                            ],
                            modifiers: [
                                { type: EChart2DModifierType.ZoomPan, options: { enableZoom: true } },
                                { type: EChart2DModifierType.MouseWheelZoom },
                                { type: EChart2DModifierType.ZoomExtents },
                            ],
                        }}
                    />
                </div>
            </div>
        </>
    );
}

export default Dashboard;
