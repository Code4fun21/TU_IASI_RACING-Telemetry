import PropTypes from "prop-types";
import ChartWrapper from "../ChartWrapper"; // Adjust the import path if necessary

const BarChart = ({ data, width = 500, height = 400 }) => {
    const options = {
        xAxis: {
            type: "category",
            data: ["10-20", "20-30", "30-40", "50-60", "70-80", "90-100", "100-150"],
        },
        yAxis: {
            type: "value",
        },
        series: [
            {
                data: [120, 200, 150, 80, 70, 110, 130],
                type: "bar",
            },
        ],
    };

    return (
        <div style={{ width, height }}>
            <ChartWrapper options={options} style={{ width: "100%", height: "100%" }} />
        </div>
    );
};
BarChart.propTypes = {
    data: PropTypes.arrayOf(PropTypes.array).isRequired, // [[lon, lat, value]]
    width: PropTypes.number,
    height: PropTypes.number,
};

export default BarChart;
