const Logo = ({ size = 140 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="140" height="140" fill="#21766D" />

      <path
        d="M76 52L48 102H104L76 52Z"
        fill="#F5F5EF"
      />

      <path
        d="M76 61V97H96L76 61Z"
        fill="#21766D"
      />
    </svg>
  );
};

export default Logo;