import PropTypes from "prop-types";
import ChartWrapper from "../ChartWrapper"; // Adjust the import path if necessary

const PieChart = ({ data }) => {
    const options = {
        title: {
            text: "Example Pie chart",
            left: "left",
        },
        legend: {
            right: 10,
            top: 20,
            bottom: 20,
            orient: "vertical",
        },
        tooltip: {
            trigger: "item",
        },
        series: [
            {
                name: "Access From",
                type: "pie",
                radius: "50%",
                data: data,
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: "rgba(0, 0, 0, 0.5)",
                    },
                },
            },
        ],
    };

    return <ChartWrapper options={options} />;
};
PieChart.propTypes = {
    data: PropTypes.arrayOf(
        PropTypes.shape({
            value: PropTypes.number.isRequired,
            name: PropTypes.string.isRequired,
        })
    ).isRequired,
};

export default PieChart;
