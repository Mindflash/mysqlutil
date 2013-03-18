CREATE DATABASE `mysqlutil_test`;

CREATE TABLE `hiloid` (
  `NextHi` bigint(20) NOT NULL,
  PRIMARY KEY (`NextHi`)
) ENGINE=InnoDB;
INSERT INTO `hiloid`(`NextHi`) values (1);

DELIMITER $$
CREATE PROCEDURE `getNextHi`(IN numberOfBatches INT)
BEGIN
START TRANSACTION;
SELECT NextHi FROM HiLoID FOR UPDATE;
UPDATE HiLoID SET NextHi = NextHi + numberOfBatches;
COMMIT;
END $$
DELIMITER ;
